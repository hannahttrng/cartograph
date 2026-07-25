import asyncio
import json

import httpx
import pytest

from backend.recipe_import import (
  AzureOpenAIRecipeProvider,
  RecipeImportProviderError,
  RecipeImportSourceError,
  extract_recipe_text_from_html,
)


def test_recipe_text_extraction_includes_reel_caption_metadata() -> None:
    html = """
    <html><head>
      <meta property="og:description" content="High protein pasta: ground turkey, rigatoni, marinara, spinach, and parmesan." />
      <script>window.unrelated = true;</script>
    </head><body><p>Watch this reel.</p></body></html>
    """

    extracted = extract_recipe_text_from_html(html)

    assert "High protein pasta" in extracted
    assert "ground turkey" in extracted


def test_recipe_text_extraction_rejects_pages_without_recipe_content() -> None:
    with pytest.raises(RecipeImportSourceError):
        extract_recipe_text_from_html("<html><body>Hi</body></html>")


def test_recipe_provider_posts_to_the_exact_configured_responses_url() -> None:
  captured_request: httpx.Request | None = None

  def handler(request: httpx.Request) -> httpx.Response:
    nonlocal captured_request
    captured_request = request
    return httpx.Response(
      200,
      json={
        "output_text": json.dumps(
          {
            "title": "High Protein Pasta",
            "ingredients": [
              {
                "name": "Ground Turkey",
                "quantity": "1",
                "unit": "lb",
                "note": None,
                "tags": ["ground turkey"],
              }
            ],
            "tags": ["ground turkey"],
            "warnings": ["Quantities and ingredients are suggested."],
          }
        )
      },
    )

  provider = AzureOpenAIRecipeProvider(
    inference_url="https://gateway.example.test/inference",
    api_key="test-key",
    transport=httpx.MockTransport(handler),
  )

  imported = asyncio.run(provider.import_recipe("High protein pasta with turkey"))

  assert captured_request is not None
  assert str(captured_request.url) == "https://gateway.example.test/inference"
  assert captured_request.headers["api-key"] == "test-key"
  assert imported.title == "High Protein Pasta"
  assert imported.ingredients[0].tags == ["ground turkey"]


def test_meal_idea_prompt_requests_balanced_supporting_ingredients() -> None:
  captured_request: httpx.Request | None = None

  def handler(request: httpx.Request) -> httpx.Response:
    nonlocal captured_request
    captured_request = request
    return httpx.Response(
      200,
      json={
        "output_text": json.dumps(
          {
            "title": "High Protein Pasta",
            "ingredients": [
              {
                "name": "Ground Beef",
                "quantity": "1",
                "unit": "lb",
                "note": None,
                "tags": ["ground beef"],
              }
            ],
            "tags": ["ground beef"],
            "warnings": ["Ingredients and quantities are suggested."],
          }
        )
      },
    )

  provider = AzureOpenAIRecipeProvider(
    inference_url="https://gateway.example.test/inference",
    api_key="test-key",
    transport=httpx.MockTransport(handler),
  )

  asyncio.run(provider.import_recipe("High protein pasta with ground beef"))

  assert captured_request is not None
  instructions = json.loads(captured_request.content)["instructions"]
  assert "at least one compatible vegetable" in instructions
  assert "optionally parmesan or cottage cheese" in instructions
  assert "Do not add optional ingredients to a complete source" in instructions


def test_recipe_provider_parses_chat_completions_recipe_response() -> None:
  recipe = {
    "title": "Taco Night",
    "ingredients": [
      {
        "name": "Corn Tortillas",
        "quantity": "12",
        "unit": "count",
        "note": None,
        "tags": ["corn tortilla"],
      }
    ],
    "tags": ["corn tortilla"],
    "warnings": [],
  }
  provider = AzureOpenAIRecipeProvider(
    inference_url="https://gateway.example.test/chat",
    api_key="test-key",
    api_mode="chat-completions",
    transport=httpx.MockTransport(
      lambda _request: httpx.Response(
        200,
        json={"choices": [{"message": {"content": json.dumps(recipe)}}]},
      )
    ),
  )

  imported = asyncio.run(provider.import_recipe("1 lb beef, 12 tortillas"))

  assert imported.title == "Taco Night"
  assert imported.ingredients[0].name == "Corn Tortillas"


def test_carter_chat_includes_grounded_conversation_guidance() -> None:
  captured_request: httpx.Request | None = None

  def handler(request: httpx.Request) -> httpx.Response:
    nonlocal captured_request
    captured_request = request
    return httpx.Response(
      200,
      json={"output": [{"content": [{"text": "Cartograph turns a list into route options."}]}]},
    )

  provider = AzureOpenAIRecipeProvider(
    inference_url="https://gateway.example.test/responses",
    api_key="test-key",
    transport=httpx.MockTransport(handler),
  )

  answer = asyncio.run(provider.answer_question(
    "How does Cartograph work?",
    [],
  ))

  assert answer == "Cartograph turns a list into route options."
  assert captured_request is not None
  instructions = json.loads(captured_request.content)["instructions"]
  assert "ask one concise clarifying question" in instructions
  assert "Never imply a list, route, store comparison" in instructions


def test_recipe_provider_explains_a_missing_gateway_route() -> None:
  provider = AzureOpenAIRecipeProvider(
    inference_url="https://gateway.example.test/missing",
    api_key="test-key",
    transport=httpx.MockTransport(lambda _request: httpx.Response(404)),
  )

  with pytest.raises(RecipeImportProviderError, match="CARTER_API_URL"):
    asyncio.run(provider.answer_question("What can you do?", []))
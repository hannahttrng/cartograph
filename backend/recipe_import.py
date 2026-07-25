"""Azure OpenAI recipe parsing and bounded recipe-page text extraction."""

from __future__ import annotations

import asyncio
import ipaddress
import json
import os
import socket
from html.parser import HTMLParser
from typing import Any, Literal, Protocol, runtime_checkable
from urllib.parse import urljoin, urlparse

import httpx
from pydantic import ValidationError

from backend.types import (
    AssistantChatMessage,
    AssistantRecipeImportRequest,
    AssistantRecipeImportResponse,
    RecipeSourceType,
)

CARTER_SYSTEM_PROMPT = """You are Carter, Cartograph's friendly, conversational, and proactive grocery shopping, meal planning, and recipe assistant. Help users turn recipes, meal ideas, and grocery needs into actionable shopping lists while saving time and money.

You can help explain Cartograph, generate and scale recipes, parse recipe text or available content from public recipe and social-media URLs, estimate missing ingredient quantities, normalize grocery synonyms, suggest dietary substitutions, estimate grocery costs, and create meal-plan grocery drafts.

Use realistic household quantities when measurements are missing. Normalize synonymous ingredient names into catalog-friendly grocery terms. When estimates are necessary, label them clearly and note that prices vary by location. If pantry data is supplied, omit ingredients the user already owns. Respect dietary goals and substitutions requested by the user.

Store comparison and route recommendations must use data supplied by Cartograph. Never invent live prices, inventory, traffic, store availability, user pantry contents, or optimized routes. When those data or application actions are unavailable, explain the limitation and suggest the next supported action. Do not claim that an application action succeeded unless its result is present in the conversation or tool output.

Be concise and practical. After completing a task, include one useful next action when the response format allows it."""


class RecipeImportConfigurationError(RuntimeError):
    pass


class RecipeImportProviderError(RuntimeError):
    pass


class RecipeImportSourceError(ValueError):
    pass


@runtime_checkable
class RecipeImportProvider(Protocol):
    async def import_recipe(self, recipe_text: str) -> AssistantRecipeImportResponse:
        """Extract grocery ingredients and normalized catalog-friendly tags."""
        ...

    async def answer_question(
        self,
        question: str,
        history: list[AssistantChatMessage],
    ) -> str:
        """Answer a Cartograph question without creating a shopping list."""
        ...


class _RecipeTextExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self._ignored_depth = 0
        self._metadata: list[str] = []
        self._parts: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attributes = {name.lower(): value for name, value in attrs if value}
        if tag == "meta":
            label = (attributes.get("property") or attributes.get("name") or "").lower()
            content = attributes.get("content")
            if label in {
                "description",
                "og:description",
                "og:title",
                "twitter:description",
                "twitter:title",
            } and content:
                self._metadata.append(content.strip())
        if tag in {"script", "style", "noscript", "svg"}:
            self._ignored_depth += 1

    def handle_endtag(self, tag: str) -> None:
        if tag in {"script", "style", "noscript", "svg"} and self._ignored_depth:
            self._ignored_depth -= 1

    def handle_data(self, data: str) -> None:
        if not self._ignored_depth and data.strip():
            self._parts.append(data.strip())

    def text(self) -> str:
        deduplicated = dict.fromkeys([*self._metadata, *self._parts])
        return "\n".join(deduplicated)


def _is_public_address(address: str) -> bool:
    parsed = ipaddress.ip_address(address)
    return parsed.is_global


async def _verify_public_host(hostname: str, port: int) -> None:
    try:
        addresses = await asyncio.to_thread(
            socket.getaddrinfo,
            hostname,
            port,
            type=socket.SOCK_STREAM,
        )
    except socket.gaierror as error:
        raise RecipeImportSourceError("The recipe URL host could not be resolved.") from error

    if not addresses or any(not _is_public_address(item[4][0]) for item in addresses):
        raise RecipeImportSourceError("Recipe URLs must resolve to public internet hosts.")


async def _validate_public_url(url: str) -> None:
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname or parsed.username:
        raise RecipeImportSourceError("Enter a valid public http or https recipe URL.")

    port = parsed.port or (443 if parsed.scheme == "https" else 80)
    await _verify_public_host(parsed.hostname, port)


def extract_recipe_text_from_html(html: str) -> str:
    parser = _RecipeTextExtractor()
    parser.feed(html)
    text = parser.text()
    if len(text) < 40:
        raise RecipeImportSourceError(
            "We could not find enough recipe text or caption on this page. Paste the recipe text instead."
        )
    return text[:20_000]


async def extract_recipe_text_from_url(url: str) -> str:
    current_url = url
    timeout = httpx.Timeout(10.0, connect=5.0)
    try:
        async with httpx.AsyncClient(timeout=timeout, follow_redirects=False) as client:
            for _ in range(4):
                await _validate_public_url(current_url)
                async with client.stream(
                    "GET",
                    current_url,
                    headers={"User-Agent": "Mozilla/5.0 (compatible; Cartograph/0.1)"},
                ) as response:
                    if response.is_redirect:
                        location = response.headers.get("location")
                        if not location:
                            raise RecipeImportSourceError("Recipe URL returned an invalid redirect.")
                        current_url = urljoin(current_url, location)
                        continue
                    response.raise_for_status()
                    content_type = response.headers.get("content-type", "").lower()
                    if "text/html" not in content_type:
                        raise RecipeImportSourceError("Recipe URLs must return an HTML page.")

                    chunks: list[bytes] = []
                    size = 0
                    async for chunk in response.aiter_bytes():
                        size += len(chunk)
                        if size > 1_000_000:
                            raise RecipeImportSourceError("Recipe page is too large to import.")
                        chunks.append(chunk)
                    return extract_recipe_text_from_html(
                        b"".join(chunks).decode("utf-8", errors="replace")
                    )
            raise RecipeImportSourceError("Recipe URL redirected too many times.")
    except RecipeImportSourceError:
        raise
    except httpx.HTTPError as error:
        raise RecipeImportSourceError(
            "We could not read this recipe page. Paste the recipe text instead."
        ) from error

async def resolve_recipe_source(payload: AssistantRecipeImportRequest) -> str:
    is_url = payload.source_type == RecipeSourceType.URL or (
        payload.source_type == RecipeSourceType.AUTO
        and urlparse(payload.source).scheme in {"http", "https"}
    )
    if not is_url:
        return payload.source
    return await extract_recipe_text_from_url(payload.source)


class AzureOpenAIRecipeProvider:
    def __init__(
        self,
        *,
        inference_url: str,
        api_key: str,
        api_mode: Literal["responses", "chat-completions"] = "responses",
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self._inference_url = inference_url
        self._api_key = api_key
        self._api_mode = api_mode
        self._transport = transport

    @classmethod
    def from_environment(cls) -> AzureOpenAIRecipeProvider | None:
        inference_url = (
            os.getenv("CARTER_API_URL", "").strip()
            or os.getenv("AZURE_OPENAI_ENDPOINT", "").strip()
        )
        api_key = os.getenv("AZURE_OPENAI_API_KEY", "").strip()
        if not any((inference_url, api_key)):
            return None
        if not all((inference_url, api_key)):
            raise RecipeImportConfigurationError(
                "Carter requires CARTER_API_URL (or AZURE_OPENAI_ENDPOINT) and AZURE_OPENAI_API_KEY."
            )
        api_mode = os.getenv("CARTER_API_MODE", "responses").strip().lower()
        if api_mode not in {"responses", "chat-completions"}:
            raise RecipeImportConfigurationError(
                "CARTER_API_MODE must be 'responses' or 'chat-completions'."
            )
        return cls(
            inference_url=inference_url,
            api_key=api_key,
            api_mode=api_mode,
        )

    async def _request_text(self, *, instructions: str, user_input: str) -> str:
        if self._api_mode == "chat-completions":
            body: dict[str, Any] = {
                "model": "gpt-5.4",
                "messages": [
                    {"role": "system", "content": instructions},
                    {"role": "user", "content": user_input},
                ],
            }
        else:
            body = {
                "model": "gpt-5.4",
                "instructions": instructions,
                "input": user_input,
                "store": False,
            }

        try:
            async with httpx.AsyncClient(timeout=30.0, transport=self._transport) as client:
                response = await client.post(
                    self._inference_url,
                    headers={"api-key": self._api_key},
                    json=body,
                )
            response.raise_for_status()
            return _extract_model_text(response.json())
        except httpx.HTTPStatusError as error:
            if error.response.status_code == 404:
                message = (
                    "Carter's AI gateway endpoint was not found. Set CARTER_API_URL to the "
                    "exact inference POST URL supplied by the gateway."
                )
            else:
                message = f"Carter's AI gateway returned HTTP {error.response.status_code}."
            raise RecipeImportProviderError(message) from error
        except (httpx.HTTPError, KeyError, TypeError, ValueError) as error:
            raise RecipeImportProviderError(
                "Carter received an invalid response from the AI gateway."
            ) from error

    async def import_recipe(self, recipe_text: str) -> AssistantRecipeImportResponse:
        instructions = f"""{CARTER_SYSTEM_PROMPT}

For this task, convert the user's recipe content or meal request into structured grocery ingredients.
Return JSON only with exactly this object shape: {{"title": string|null, "ingredients": [{{"name": string, "quantity": string|null, "unit": string|null, "note": string|null, "tags": string[]}}], "tags": string[], "warnings": string[]}}.

If the input contains a complete recipe, caption, transcript, OCR text, or ingredient list, extract its ingredients and preserve stated measurements. If measurements are missing, estimate realistic amounts and add a warning that quantities were estimated. Do not add optional ingredients to a complete source unless the user requests substitutions or additions.

If the input is a meal idea, generate a compact, balanced recipe grocery draft and add a warning that ingredients and quantities are suggested. Preserve the explicitly requested main ingredients, then fill only the missing practical components: a starch or base when needed, a sauce or seasoning, and at least one compatible vegetable for an entree. Add a compatible cheese or dairy component only when it naturally fits the dish or the user's dietary goal; otherwise omit it. For example, high-protein pasta with ground beef should include pasta, a tomato-based sauce, a vegetable such as spinach, broccoli, or bell pepper, and optionally parmesan or cottage cheese. Do not add unrelated sides, pantry staples, or duplicate proteins. Apply requested serving counts, dietary substitutions, and meal goals.

Use the note field for preparation details or a concise estimated-price note only when useful. Do not claim a shopping list was created. Tags must be lowercase catalog-friendly grocery search phrases. Include at least one tag for every ingredient and include every unique ingredient tag in the top-level tags array. Use warnings for estimates, unavailable source details, and location-dependent pricing. Because this is strict JSON, do not append conversational text or next actions."""
        try:
            content = await self._request_text(
                instructions=instructions,
                user_input=recipe_text,
            )
            parsed = json.loads(content)
            return AssistantRecipeImportResponse.model_validate(parsed)
        except RecipeImportProviderError:
            raise
        except (TypeError, ValueError, ValidationError) as error:
            raise RecipeImportProviderError(
                "Carter returned an invalid recipe result. Try a more specific recipe or meal idea."
            ) from error

    async def answer_question(
        self,
        question: str,
        history: list[AssistantChatMessage],
    ) -> str:
        instructions = f"""{CARTER_SYSTEM_PROMPT}

For chat questions, answer the user's current request using the supplied conversation only as context. If the request is underspecified and a safe, useful answer depends on a preference, ask one concise clarifying question instead of guessing. Keep answers under 180 words, use short bullets only when they improve scanning, and end with one concrete next action.

Explain Cartograph features only as supported by the application: users can build a grocery list, import a recipe into an editable ingredient list, and request route candidates when the backend provides them. Treat prices, inventory, travel time, traffic, pantry contents, and route results as unknown unless the user supplied them in this conversation or they appear in application data. Never imply a list, route, store comparison, or other app action was completed unless the conversation contains its confirmed result.

For recipe creation or ingredient extraction, direct the user to Build list mode, which creates an editable shopping list. For general meal planning, give practical grocery guidance, clearly label estimates, and surface dietary, budget, serving-size, or time constraints when relevant."""
        history_text = "\n".join(
            f"{message.role}: {message.content}" for message in history
        )
        user_input = (
            f"Conversation history:\n{history_text}\n\nCurrent user question:\n{question}"
            if history_text
            else question
        )
        return await self._request_text(instructions=instructions, user_input=user_input)


def _extract_model_text(payload: object) -> str:
    if not isinstance(payload, dict):
        raise TypeError("AI gateway response must be an object")

    output_text = payload.get("output_text")
    if isinstance(output_text, str) and output_text.strip():
        return output_text

    choices = payload.get("choices")
    if isinstance(choices, list) and choices and isinstance(choices[0], dict):
        message = choices[0].get("message")
        if isinstance(message, dict) and isinstance(message.get("content"), str):
            return message["content"]

    output = payload.get("output")
    if isinstance(output, list):
        text_parts: list[str] = []
        for item in output:
            if not isinstance(item, dict) or not isinstance(item.get("content"), list):
                continue
            for content in item["content"]:
                if isinstance(content, dict) and isinstance(content.get("text"), str):
                    text_parts.append(content["text"])
        if text_parts:
            return "\n".join(text_parts)

    raise TypeError("AI gateway response did not contain model text")
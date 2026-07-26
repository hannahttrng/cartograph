"""Curated Product templates and Tag defaults for deterministic seeding."""

from __future__ import annotations

from dataclasses import dataclass
from math import gcd

from backend.types import Tag


UNIVERSAL_PRODUCT_COUNT = 10
LIMITED_PRODUCT_COUNT = 180
LIMITED_PRODUCT_ORDER_STRIDE = 37


@dataclass(frozen=True, slots=True)
class ProductTemplate:
    name: str
    tag_names: tuple[str, ...]
    unit: str
    base_price: float
    quantity: float = 1.0
    seasonal_low_month: int | None = None
    seasonal_amplitude: float = 0.0
    modifiers: tuple[str, ...] = ()
    modifier_variants: tuple[str | None, ...] = ()


def _product(
    name: str,
    tag_names: tuple[str, ...],
    unit: str,
    base_price: float,
    quantity: float = 1.0,
    seasonal_low_month: int | None = None,
    seasonal_amplitude: float = 0.0,
    modifiers: tuple[str, ...] = (),
    modifier_variants: tuple[str | None, ...] = (),
) -> ProductTemplate:
    return ProductTemplate(
        name=name,
        tag_names=tag_names,
        unit=unit,
        base_price=base_price,
        quantity=quantity,
        seasonal_low_month=seasonal_low_month,
        seasonal_amplitude=seasonal_amplitude,
        modifiers=modifiers,
        modifier_variants=modifier_variants,
    )


def _sparse_brands(*brands: str) -> tuple[str | None, ...]:
    if len(brands) not in (2, 3):
        raise ValueError("sparse brand variants require two or three brands")
    return (*brands, *(None for _ in range(6 - len(brands))))


UNIVERSAL_PRODUCTS = (
    _product(
        "Honeycrisp Apples",
        ("honeycrisp apple", "apple", "fruit"),
        "lbs",
        1.99,
        seasonal_low_month=10,
        seasonal_amplitude=0.20,
        modifier_variants=("origin: washington", "origin: chile", None),
    ),
    _product(
        "Bananas",
        ("banana", "fruit"),
        "lbs",
        0.69,
        seasonal_low_month=7,
        seasonal_amplitude=0.04,
    ),
    _product("Whole Milk", ("milk", "dairy"), "gallon", 4.29),
    _product("Large Eggs", ("egg", "dairy", "protein"), "count", 4.79, 12.0),
    _product(
        "Sandwich Bread",
        ("bread", "bakery", "wheat"),
        "loaf",
        3.49,
        modifier_variants=_sparse_brands(
            "brand: nature's own", "brand: dave's killer bread"
        ),
    ),
    _product("Unsalted Butter", ("butter", "dairy"), "oz", 4.99, 16.0),
    _product(
        "Chicken Breasts",
        ("chicken", "poultry", "meat", "protein"),
        "lbs",
        4.99,
        modifier_variants=_sparse_brands(
            "brand: foster farms", "brand: tyson"
        ),
    ),
    _product(
        "Ground Beef 80/20",
        ("ground beef", "beef", "meat", "protein"),
        "lbs",
        5.49,
    ),
    _product(
        "Long Grain White Rice",
        ("rice", "grain", "pantry"),
        "lbs",
        7.99,
        5.0,
        modifier_variants=_sparse_brands("brand: mahatma", "brand: lundberg"),
    ),
    _product(
        "Spaghetti Pasta",
        ("spaghetti", "pasta", "pantry"),
        "oz",
        1.49,
        16.0,
        modifier_variants=_sparse_brands("brand: barilla", "brand: de cecco"),
    ),
)


_FORMER_UNIVERSAL_PRODUCTS = (
    _product(
        "Tomato Pasta Sauce",
        ("tomato sauce", "sauce", "pasta", "pantry"),
        "oz",
        2.49,
        24.0,
        modifier_variants=_sparse_brands("brand: rao's", "brand: prego"),
    ),
    _product(
        "Sharp Cheddar Cheese",
        ("cheddar", "cheese", "dairy"),
        "oz",
        4.49,
        8.0,
        modifier_variants=_sparse_brands("brand: tillamook", "brand: sargento"),
    ),
    _product(
        "Plain Greek Yogurt",
        ("greek yogurt", "yogurt", "dairy", "protein"),
        "oz",
        5.99,
        32.0,
        modifier_variants=_sparse_brands(
            "brand: chobani", "brand: fage", "brand: oikos"
        ),
    ),
    _product(
        "Orange Juice",
        ("orange juice", "juice", "beverage"),
        "oz",
        4.49,
        52.0,
        modifier_variants=_sparse_brands(
            "brand: tropicana", "brand: simply orange", "brand: florida's natural"
        ),
    ),
    _product(
        "Creamy Peanut Butter",
        ("peanut butter", "nut butter", "pantry", "protein"),
        "oz",
        3.99,
        16.0,
        modifier_variants=_sparse_brands(
            "brand: jif", "brand: skippy", "brand: peter pan"
        ),
    ),
    _product(
        "Russet Potatoes",
        ("russet potato", "potato", "vegetable"),
        "lbs",
        4.99,
        5.0,
        9,
        0.08,
    ),
    _product(
        "Yellow Onions",
        ("yellow onion", "onion", "vegetable"),
        "lbs",
        3.99,
        3.0,
        9,
        0.07,
    ),
    _product(
        "Roma Tomatoes",
        ("roma tomato", "tomato", "vegetable"),
        "lbs",
        1.49,
        seasonal_low_month=8,
        seasonal_amplitude=0.16,
    ),
    _product(
        "Hass Avocados",
        ("hass avocado", "avocado", "fruit"),
        "count",
        4.99,
        4.0,
        6,
        0.10,
    ),
    _product(
        "Bottled Water 24-Pack",
        ("water", "bottled water", "beverage"),
        "count",
        5.99,
        24.0,
        modifier_variants=_sparse_brands("brand: aquafina", "brand: dasani"),
    ),
    _product(
        "Classic Potato Chips",
        ("potato chip", "chip", "snack"),
        "oz",
        4.99,
        8.0,
        modifier_variants=_sparse_brands("brand: lays", "brand: ruffles"),
    ),
)


_EXISTING_LIMITED_PRODUCTS = (
    _product("Bulk Chia Seeds", ("chia seed", "seed", "pantry"), "oz", 8.99, 16.0),
    _product("Speculoos Cookie Butter", ("cookie butter", "spread", "dessert"), "oz", 3.99, 14.1),
    _product("Marinated Carne Asada", ("carne asada", "beef", "meat"), "lbs", 9.99),
    _product("Fresh Corn Tortillas", ("corn tortilla", "tortilla", "bakery"), "count", 2.49, 30.0),
    _product("Maple Almond Granola", ("granola", "cereal", "almond"), "oz", 5.49, 12.0),
    _product("Tomato Basil Soup", ("tomato soup", "soup", "pantry"), "oz", 3.29, 18.5),
    _product("Deli Potato Salad", ("potato salad", "deli", "prepared"), "lbs", 5.99),
    _product("Fresh Hatch Chile Salsa", ("hatch chile", "salsa", "condiment"), "oz", 4.49, 16.0, 8, 0.12),
    _product("Family Pack Chicken Drumsticks", ("chicken drumstick", "chicken", "meat"), "lbs", 8.99, 4.0),
    _product("Bakery Bolillo Rolls", ("bolillo", "bread", "bakery"), "count", 3.99, 6.0),
    _product("Fresh Figs", ("fig", "fruit"), "lbs", 5.99, seasonal_low_month=8, seasonal_amplitude=0.25),
    _product("Meyer Lemons", ("meyer lemon", "lemon", "citrus", "fruit"), "lbs", 3.99, seasonal_low_month=1, seasonal_amplitude=0.18),
    _product("Rainbow Chard", ("rainbow chard", "chard", "vegetable"), "bunch", 2.99, seasonal_low_month=4, seasonal_amplitude=0.10),
    _product("Heirloom Tomatoes", ("heirloom tomato", "tomato", "vegetable"), "lbs", 4.99, seasonal_low_month=8, seasonal_amplitude=0.24),
    _product("Japanese Sweet Potatoes", ("japanese sweet potato", "sweet potato", "vegetable"), "lbs", 2.49, seasonal_low_month=10, seasonal_amplitude=0.12),
    _product("Fuyu Persimmons", ("persimmon", "fruit"), "lbs", 3.99, seasonal_low_month=11, seasonal_amplitude=0.25),
    _product("Blood Oranges", ("blood orange", "orange", "citrus", "fruit"), "lbs", 2.99, seasonal_low_month=2, seasonal_amplitude=0.20),
    _product("Fresh Fava Beans", ("fava bean", "bean", "vegetable"), "lbs", 4.49, seasonal_low_month=4, seasonal_amplitude=0.22),
    _product("Fresh Apricots", ("apricot", "fruit"), "lbs", 4.99, seasonal_low_month=6, seasonal_amplitude=0.24),
    _product("Anaheim Chiles", ("anaheim chile", "chile", "pepper", "vegetable"), "lbs", 2.49, seasonal_low_month=8, seasonal_amplitude=0.14),
    _product("Blackberries", ("blackberry", "berry", "fruit"), "oz", 4.49, 6.0, 6, 0.20),
    _product("Globe Artichokes", ("artichoke", "vegetable"), "count", 5.00, 2.0, 4, 0.18),
    _product("Fresh Leeks", ("leek", "vegetable"), "bunch", 3.49, seasonal_low_month=2, seasonal_amplitude=0.10),
    _product("Dapple Dandy Pluots", ("pluot", "stone fruit", "fruit"), "lbs", 4.49, seasonal_low_month=7, seasonal_amplitude=0.24),
    _product("Sugar Snap Peas", ("sugar snap pea", "pea", "vegetable"), "oz", 4.99, 8.0, 4, 0.16),
    _product("Delicata Squash", ("delicata squash", "squash", "vegetable"), "lbs", 2.49, seasonal_low_month=10, seasonal_amplitude=0.18),
    _product("Belgian Endive", ("endive", "leafy", "vegetable"), "count", 4.99, 3.0, 1, 0.08),
    _product("Kiwi Berries", ("kiwi berry", "berry", "fruit"), "oz", 5.99, 6.0, 9, 0.25),
    _product("Romanesco Cauliflower", ("romanesco", "cauliflower", "vegetable"), "count", 4.49, seasonal_low_month=11, seasonal_amplitude=0.12),
    _product("Passion Fruit", ("passion fruit", "tropical fruit", "fruit"), "count", 6.00, 4.0, 7, 0.16),
    _product("Rainier Cherries", ("rainier cherry", "cherry", "fruit"), "lbs", 7.99, seasonal_low_month=6, seasonal_amplitude=0.28),
    _product("Asparagus", ("asparagus", "vegetable"), "lbs", 3.99, seasonal_low_month=4, seasonal_amplitude=0.20),
    _product("Yellow Peaches", ("peach", "stone fruit", "fruit"), "lbs", 3.49, seasonal_low_month=7, seasonal_amplitude=0.24),
    _product("White Nectarines", ("nectarine", "stone fruit", "fruit"), "lbs", 3.99, seasonal_low_month=7, seasonal_amplitude=0.24),
    _product("Pomegranates", ("pomegranate", "fruit"), "count", 5.00, 2.0, 11, 0.22),
    _product("Fresh Cranberries", ("cranberry", "berry", "fruit"), "oz", 3.99, 12.0, 11, 0.25),
    _product("Brussels Sprouts", ("brussels sprout", "vegetable"), "lbs", 3.49, seasonal_low_month=11, seasonal_amplitude=0.16),
    _product("Acorn Squash", ("acorn squash", "squash", "vegetable"), "lbs", 1.99, seasonal_low_month=10, seasonal_amplitude=0.16),
    _product("Fresh Green Peas", ("green pea", "pea", "vegetable"), "lbs", 3.99, seasonal_low_month=4, seasonal_amplitude=0.16),
    _product("Mini Watermelons", ("watermelon", "melon", "fruit"), "count", 4.99, seasonal_low_month=7, seasonal_amplitude=0.22),
    _product("Strawberries", ("strawberry", "berry", "fruit"), "lbs", 3.99, seasonal_low_month=5, seasonal_amplitude=0.18),
    _product("Blueberries", ("blueberry", "berry", "fruit"), "oz", 4.49, 6.0, 7, 0.18),
    _product("Raspberries", ("raspberry", "berry", "fruit"), "oz", 4.99, 6.0, 6, 0.18),
    _product("Seedless Watermelon", ("watermelon", "melon", "fruit"), "count", 7.99, seasonal_low_month=7, seasonal_amplitude=0.22),
    _product("Sweet Corn", ("sweet corn", "corn", "vegetable"), "count", 4.00, 4.0, 7, 0.20),
    _product("Green Beans", ("green bean", "bean", "vegetable"), "lbs", 2.99, seasonal_low_month=7, seasonal_amplitude=0.14),
    _product("Zucchini", ("zucchini", "squash", "vegetable"), "lbs", 1.99, seasonal_low_month=7, seasonal_amplitude=0.14),
    _product("Butternut Squash", ("butternut squash", "squash", "vegetable"), "lbs", 1.79, seasonal_low_month=10, seasonal_amplitude=0.14),
    _product("Pie Pumpkins", ("pumpkin", "squash", "vegetable"), "count", 4.99, seasonal_low_month=10, seasonal_amplitude=0.28),
    _product("Red Seedless Grapes", ("red grape", "grape", "fruit"), "lbs", 2.99, seasonal_low_month=9, seasonal_amplitude=0.14),
    _product("Bartlett Pears", ("bartlett pear", "pear", "fruit"), "lbs", 2.49, seasonal_low_month=9, seasonal_amplitude=0.16),
    _product("Broccoli Crowns", ("broccoli", "cruciferous", "vegetable"), "lbs", 2.49, seasonal_low_month=2, seasonal_amplitude=0.08),
    _product("Cauliflower", ("cauliflower", "cruciferous", "vegetable"), "count", 3.49, seasonal_low_month=2, seasonal_amplitude=0.10),
    _product("Baby Spinach", ("baby spinach", "spinach", "leafy", "vegetable"), "oz", 3.99, 5.0, 3, 0.06),
    _product("Lacinato Kale", ("kale", "leafy", "vegetable"), "bunch", 2.49, seasonal_low_month=1, seasonal_amplitude=0.08),
    _product("Cilantro", ("cilantro", "herb"), "bunch", 0.99, seasonal_low_month=4, seasonal_amplitude=0.06),
    _product("Limes", ("lime", "citrus", "fruit"), "count", 3.00, 5.0, 6, 0.10),
    _product("Jalapeno Peppers", ("jalapeno", "pepper", "chile", "vegetable"), "lbs", 1.99, seasonal_low_month=8, seasonal_amplitude=0.12),
    _product("Sourdough Bread", ("sourdough", "bread", "bakery"), "loaf", 5.49),
    _product("Oat Milk", ("oat milk", "non dairy", "beverage"), "oz", 4.49, 64.0, modifier_variants=_sparse_brands("brand: oatly", "brand: planet oat")),
)


_ADDITIONAL_PROTEIN_PRODUCTS = (
    _product("Boneless Pork Chops", ("pork chop", "pork", "meat", "protein"), "lbs", 6.49),
    _product("Pork Tenderloin", ("pork tenderloin", "pork", "meat", "protein"), "lbs", 8.99),
    _product("Breakfast Sausage Links", ("sausage", "pork", "breakfast", "protein"), "oz", 5.49, 12.0),
    _product("Hickory Smoked Bacon", ("bacon", "pork", "breakfast", "protein"), "oz", 6.99, 12.0),
    _product("Bone-In Chicken Thighs", ("chicken thigh", "chicken", "poultry", "meat"), "lbs", 7.49, 3.0),
    _product("Lean Ground Turkey", ("ground turkey", "turkey", "meat", "protein"), "lbs", 5.49),
    _product("Turkey Breast Cutlets", ("turkey breast", "turkey", "meat", "protein"), "lbs", 7.49),
    _product("Beef Sirloin Steak", ("sirloin steak", "beef", "meat", "protein"), "lbs", 10.99),
    _product("Beef Chuck Roast", ("chuck roast", "beef", "meat", "protein"), "lbs", 18.99, 3.0),
    _product("Beef Short Ribs", ("short rib", "beef", "meat", "protein"), "lbs", 17.99, 2.0),
    _product("Lamb Loin Chops", ("lamb chop", "lamb", "meat", "protein"), "lbs", 13.99),
    _product("Italian Style Meatballs", ("meatball", "beef", "prepared", "protein"), "oz", 7.49, 16.0),
    _product("Oven Roasted Deli Turkey", ("deli turkey", "turkey", "deli", "protein"), "oz", 8.99, 16.0),
    _product("Herb Rotisserie Chicken", ("rotisserie chicken", "chicken", "prepared", "protein"), "count", 8.99),
    _product("Atlantic Salmon Fillets", ("salmon", "fish", "seafood", "protein"), "lbs", 12.99),
    _product("Tilapia Fillets", ("tilapia", "fish", "seafood", "protein"), "lbs", 8.49),
    _product("Raw Jumbo Shrimp", ("shrimp", "shellfish", "seafood", "protein"), "lbs", 11.99),
    _product("Chunk Light Tuna", ("tuna", "fish", "pantry", "protein"), "oz", 1.79, 5.0),
    _product("Extra Firm Tofu", ("tofu", "soy", "vegetarian", "protein"), "oz", 2.99, 14.0),
    _product("Organic Tempeh", ("tempeh", "soy", "vegetarian", "protein"), "oz", 3.99, 8.0),
)


_ADDITIONAL_DAIRY_FROZEN_PRODUCTS = (
    _product("Unsweetened Almond Milk", ("almond milk", "non dairy", "beverage"), "oz", 3.99, 64.0),
    _product("Vanilla Skyr", ("skyr", "yogurt", "dairy", "protein"), "oz", 5.49, 24.0),
    _product("Lowfat Cottage Cheese", ("cottage cheese", "cheese", "dairy", "protein"), "oz", 4.49, 24.0),
    _product("Cultured Sour Cream", ("sour cream", "dairy", "condiment"), "oz", 2.99, 16.0),
    _product("Original Cream Cheese", ("cream cheese", "cheese", "dairy"), "oz", 3.49, 8.0),
    _product("Fresh Mozzarella", ("mozzarella", "cheese", "dairy"), "oz", 5.99, 8.0),
    _product("Feta Cheese Crumbles", ("feta", "cheese", "dairy"), "oz", 4.49, 6.0),
    _product("Queso Fresco", ("queso fresco", "cheese", "dairy"), "oz", 5.49, 10.0),
    _product("Fresh Burrata", ("burrata", "cheese", "dairy"), "oz", 7.99, 8.0),
    _product("Heavy Whipping Cream", ("heavy cream", "cream", "dairy"), "oz", 5.49, 16.0),
    _product("Half and Half", ("half and half", "cream", "dairy"), "oz", 4.29, 32.0),
    _product("Frozen Sweet Peas", ("frozen pea", "pea", "frozen", "vegetable"), "oz", 2.49, 12.0),
    _product("Frozen Mixed Vegetables", ("mixed vegetable", "frozen", "vegetable"), "oz", 2.99, 16.0),
    _product("Four Cheese Frozen Pizza", ("frozen pizza", "pizza", "frozen", "prepared"), "count", 7.99),
    _product("Buttermilk Frozen Waffles", ("waffle", "breakfast", "frozen"), "count", 4.49, 10.0),
    _product("Vanilla Bean Ice Cream", ("ice cream", "dessert", "frozen"), "oz", 6.49, 48.0),
    _product("Raspberry Fruit Sorbet", ("sorbet", "dessert", "frozen"), "oz", 5.49, 16.0),
    _product("Frozen Chicken Nuggets", ("chicken nugget", "chicken", "frozen", "prepared"), "oz", 8.99, 24.0),
)


_ADDITIONAL_PANTRY_PRODUCTS = (
    _product("Organic White Quinoa", ("quinoa", "grain", "pantry"), "lbs", 8.99, 2.0),
    _product("Long Grain Brown Rice", ("brown rice", "rice", "grain", "pantry"), "lbs", 8.49, 5.0),
    _product("Fragrant Jasmine Rice", ("jasmine rice", "rice", "grain", "pantry"), "lbs", 9.49, 5.0),
    _product("Old Fashioned Rolled Oats", ("rolled oat", "oat", "cereal", "pantry"), "oz", 5.49, 42.0),
    _product("All Purpose Flour", ("flour", "baking", "pantry"), "lbs", 4.49, 5.0),
    _product("Granulated Cane Sugar", ("sugar", "baking", "pantry"), "lbs", 4.29, 4.0),
    _product("Canned Black Beans", ("black bean", "bean", "canned", "pantry"), "oz", 1.29, 15.0),
    _product("Canned Chickpeas", ("chickpea", "bean", "canned", "pantry"), "oz", 1.39, 15.0),
    _product("Canned Kidney Beans", ("kidney bean", "bean", "canned", "pantry"), "oz", 1.39, 15.0),
    _product("Fire Roasted Diced Tomatoes", ("diced tomato", "tomato", "canned", "pantry"), "oz", 1.79, 14.5),
    _product("Double Concentrated Tomato Paste", ("tomato paste", "tomato", "canned", "pantry"), "oz", 1.29, 6.0),
    _product("Low Sodium Chicken Broth", ("chicken broth", "broth", "soup", "pantry"), "oz", 2.49, 32.0),
    _product("Organic Vegetable Broth", ("vegetable broth", "broth", "soup", "pantry"), "oz", 2.69, 32.0),
    _product("Extra Virgin Olive Oil", ("olive oil", "oil", "pantry"), "oz", 12.99, 25.5),
    _product("Pure Canola Oil", ("canola oil", "oil", "pantry"), "oz", 6.99, 48.0),
    _product("Raw Apple Cider Vinegar", ("apple cider vinegar", "vinegar", "pantry"), "oz", 5.99, 32.0),
    _product("Naturally Brewed Soy Sauce", ("soy sauce", "sauce", "condiment", "pantry"), "oz", 3.99, 15.0),
    _product("Unsweetened Coconut Milk", ("coconut milk", "canned", "pantry"), "oz", 2.49, 13.5),
    _product("Mild Taco Seasoning", ("taco seasoning", "spice", "pantry"), "oz", 1.29),
    _product("Ground Cumin", ("cumin", "spice", "pantry"), "oz", 3.49, 2.0),
    _product("Smoked Paprika", ("paprika", "spice", "pantry"), "oz", 3.99, 2.0),
    _product("Fine Sea Salt", ("sea salt", "salt", "spice", "pantry"), "oz", 2.99, 26.0),
)


_ADDITIONAL_PRODUCE_PRODUCTS = (
    _product("Gala Apples", ("gala apple", "apple", "fruit"), "lbs", 1.79, seasonal_low_month=10, seasonal_amplitude=0.14),
    _product("Granny Smith Apples", ("granny smith apple", "apple", "fruit"), "lbs", 1.69, seasonal_low_month=10, seasonal_amplitude=0.14),
    _product("Navel Oranges", ("navel orange", "orange", "citrus", "fruit"), "lbs", 1.49, seasonal_low_month=2, seasonal_amplitude=0.14),
    _product("California Mandarins", ("mandarin", "orange", "citrus", "fruit"), "lbs", 5.49, 3.0, 1, 0.15),
    _product("Eureka Lemons", ("eureka lemon", "lemon", "citrus", "fruit"), "lbs", 2.49, seasonal_low_month=1, seasonal_amplitude=0.12),
    _product("Red Bell Peppers", ("red bell pepper", "bell pepper", "pepper", "vegetable"), "count", 4.49, 3.0, 8, 0.12),
    _product("Green Bell Peppers", ("green bell pepper", "bell pepper", "pepper", "vegetable"), "count", 3.49, 3.0, 8, 0.12),
    _product("English Cucumbers", ("english cucumber", "cucumber", "vegetable"), "count", 1.79),
    _product("Whole Carrots", ("carrot", "root vegetable", "vegetable"), "lbs", 2.49, 2.0, 10, 0.08),
    _product("Celery Stalks", ("celery", "vegetable"), "count", 2.29),
    _product("Iceberg Lettuce", ("iceberg lettuce", "lettuce", "leafy", "vegetable"), "count", 2.49),
    _product("Romaine Hearts", ("romaine", "lettuce", "leafy", "vegetable"), "count", 4.49, 3.0),
    _product("White Mushrooms", ("white mushroom", "mushroom", "vegetable"), "oz", 2.99, 8.0),
    _product("Fresh Garlic Bulbs", ("garlic", "allium", "vegetable"), "count", 2.49, 3.0),
    _product("Fresh Shallots", ("shallot", "allium", "vegetable"), "lbs", 3.99),
)


_ADDITIONAL_BAKERY_PRODUCTS = (
    _product("Whole Wheat Bread", ("whole wheat bread", "bread", "bakery", "wheat"), "loaf", 3.99),
    _product("Buttery Brioche Loaf", ("brioche", "bread", "bakery"), "loaf", 5.49),
    _product("Original English Muffins", ("english muffin", "bread", "bakery", "breakfast"), "count", 4.29, 6.0),
    _product("Plain Bagels", ("bagel", "bread", "bakery", "breakfast"), "count", 4.99, 6.0),
    _product("Soft Flour Tortillas", ("flour tortilla", "tortilla", "bakery"), "count", 3.49, 10.0),
    _product("Butter Croissants", ("croissant", "pastry", "bakery"), "count", 5.99, 4.0),
    _product("Blueberry Muffins", ("blueberry muffin", "muffin", "bakery"), "count", 5.49, 4.0),
    _product("Iced Cinnamon Rolls", ("cinnamon roll", "pastry", "bakery"), "count", 4.99, 8.0),
    _product("Sesame Hamburger Buns", ("hamburger bun", "bread", "bakery"), "count", 3.49, 8.0),
    _product("Classic Hot Dog Buns", ("hot dog bun", "bread", "bakery"), "count", 3.49, 8.0),
    _product("Whole Wheat Pita Bread", ("pita", "bread", "bakery", "wheat"), "count", 3.99, 6.0),
    _product("Garlic Naan Bread", ("naan", "bread", "bakery"), "count", 4.49, 4.0),
)


_ADDITIONAL_BEVERAGE_PRODUCTS = (
    _product("Honeycrisp Apple Juice", ("apple juice", "juice", "beverage"), "oz", 4.99, 64.0),
    _product("Cranberry Juice Cocktail", ("cranberry juice", "juice", "beverage"), "oz", 4.49, 64.0),
    _product("Lime Sparkling Water", ("sparkling water", "water", "beverage"), "count", 4.99, 8.0),
    _product("Classic Cola 12-Pack", ("cola", "soda", "beverage"), "count", 8.49, 12.0),
    _product("Cold Brew Coffee Concentrate", ("cold brew", "coffee", "beverage"), "oz", 7.99, 32.0),
    _product("Medium Roast Ground Coffee", ("ground coffee", "coffee", "beverage"), "oz", 9.99, 12.0),
    _product("Organic Green Tea Bags", ("green tea", "tea", "beverage"), "count", 4.49, 20.0),
    _product("English Breakfast Tea Bags", ("black tea", "tea", "beverage"), "count", 4.29, 20.0),
    _product("Ginger Lemon Kombucha", ("kombucha", "fermented beverage", "beverage"), "oz", 3.99, 16.0),
    _product("Pure Coconut Water", ("coconut water", "water", "beverage"), "oz", 4.49, 32.0),
)


_ADDITIONAL_SNACK_PREPARED_PRODUCTS = (
    _product("Restaurant Style Tortilla Chips", ("tortilla chip", "chip", "snack"), "oz", 4.49, 12.0),
    _product("Sea Salt Pretzel Twists", ("pretzel", "snack"), "oz", 3.99, 16.0),
    _product("Baked Cheddar Crackers", ("cheddar cracker", "cracker", "snack"), "oz", 4.29, 12.0),
    _product("Dry Roasted Almonds", ("roasted almond", "almond", "nut", "snack"), "oz", 8.99, 16.0),
    _product("Deluxe Mixed Nuts", ("mixed nut", "nut", "snack"), "oz", 10.99, 16.0),
    _product("Classic Hummus", ("hummus", "dip", "prepared"), "oz", 3.99, 10.0),
    _product("Fresh Guacamole", ("guacamole", "dip", "prepared"), "oz", 5.49, 8.0),
    _product("Real Mayonnaise", ("mayonnaise", "condiment"), "oz", 5.99, 30.0),
    _product("Tomato Ketchup", ("ketchup", "condiment"), "oz", 4.49, 32.0),
    _product("Classic Yellow Mustard", ("yellow mustard", "mustard", "condiment"), "oz", 2.49, 20.0),
    _product("Kosher Dill Pickles", ("dill pickle", "pickle", "condiment"), "oz", 4.99, 24.0),
    _product("Deli Macaroni Salad", ("macaroni salad", "deli", "prepared"), "lbs", 5.49),
)


def _spread_limited_products(
    products: tuple[ProductTemplate, ...],
) -> tuple[ProductTemplate, ...]:
    if len(products) != LIMITED_PRODUCT_COUNT:
        raise ValueError(
            f"limited catalog must contain {LIMITED_PRODUCT_COUNT} concepts"
        )
    if gcd(LIMITED_PRODUCT_ORDER_STRIDE, len(products)) != 1:
        raise ValueError("limited product ordering stride must visit every concept")
    return tuple(
        products[(position * LIMITED_PRODUCT_ORDER_STRIDE) % len(products)]
        for position in range(len(products))
    )


SPECIALTY_PRODUCTS = _spread_limited_products(
    _FORMER_UNIVERSAL_PRODUCTS
    + _EXISTING_LIMITED_PRODUCTS
    + _ADDITIONAL_PROTEIN_PRODUCTS
    + _ADDITIONAL_DAIRY_FROZEN_PRODUCTS
    + _ADDITIONAL_PANTRY_PRODUCTS
    + _ADDITIONAL_PRODUCE_PRODUCTS
    + _ADDITIONAL_BAKERY_PRODUCTS
    + _ADDITIONAL_BEVERAGE_PRODUCTS
    + _ADDITIONAL_SNACK_PREPARED_PRODUCTS
)


CATEGORY_TAG_DEFAULTS = {
    "bakery": ("count", 2.0),
    "berry": ("oz", 12.0),
    "beverage": ("count", 2.0),
    "bread": ("loaf", 1.0),
    "chicken": ("lbs", 2.0),
    "citrus": ("lbs", 2.0),
    "cruciferous": ("lbs", 1.5),
    "dairy": ("count", 2.0),
    "fruit": ("lbs", 2.0),
    "leafy": ("bunch", 2.0),
    "meat": ("lbs", 1.5),
    "pantry": ("count", 2.0),
    "pasta": ("oz", 24.0),
    "pea": ("lbs", 1.5),
    "protein": ("lbs", 1.5),
    "squash": ("lbs", 2.0),
    "vegetable": ("lbs", 2.0),
}

SHOPPING_TAG_DEFAULTS = {
    "apple": ("lbs", 2.0),
    "artichoke": ("count", 2.0),
    "banana": ("lbs", 2.0),
    "bottled water": ("count", 12.0),
    "chicken": ("lbs", 2.0),
    "corn tortilla": ("count", 18.0),
    "egg": ("count", 12.0),
    "ground beef": ("lbs", 1.5),
    "hass avocado": ("count", 4.0),
    "pomegranate": ("count", 2.0),
}


def build_tag_catalog() -> tuple[Tag, ...]:
    defaults: dict[str, tuple[str, float]] = {}
    for product in UNIVERSAL_PRODUCTS + SPECIALTY_PRODUCTS:
        for tag in product.tag_names:
            defaults.setdefault(tag, (product.unit, product.quantity))

    defaults.update(CATEGORY_TAG_DEFAULTS)
    defaults.update(SHOPPING_TAG_DEFAULTS)
    return tuple(
        Tag(tag=tag, defaultUnit=unit, defaultQuantity=quantity)
        for tag, (unit, quantity) in sorted(defaults.items())
    )


def _validate_product_catalog() -> None:
    if len(UNIVERSAL_PRODUCTS) != UNIVERSAL_PRODUCT_COUNT:
        raise ValueError(
            f"universal catalog must contain {UNIVERSAL_PRODUCT_COUNT} concepts"
        )
    products = UNIVERSAL_PRODUCTS + SPECIALTY_PRODUCTS
    names = [product.name for product in products]
    if len(names) != len(set(names)):
        raise ValueError("Product template names must be unique")
    for product in products:
        if product.name != product.name.strip() or not product.name:
            raise ValueError("Product template names must be nonblank and stripped")
        if product.unit != product.unit.strip().lower() or not product.unit:
            raise ValueError(f"invalid unit for Product template {product.name!r}")
        if product.base_price <= 0 or product.quantity <= 0:
            raise ValueError(f"invalid price or quantity for {product.name!r}")
        if len(product.tag_names) != len(set(product.tag_names)):
            raise ValueError(f"duplicate tags for Product template {product.name!r}")
        if any(tag != tag.strip().lower() or not tag for tag in product.tag_names):
            raise ValueError(f"invalid tag for Product template {product.name!r}")


_validate_product_catalog()
TAGS = build_tag_catalog()


__all__ = [
    "CATEGORY_TAG_DEFAULTS",
    "LIMITED_PRODUCT_COUNT",
    "ProductTemplate",
    "SHOPPING_TAG_DEFAULTS",
    "SPECIALTY_PRODUCTS",
    "TAGS",
    "UNIVERSAL_PRODUCT_COUNT",
    "UNIVERSAL_PRODUCTS",
    "build_tag_catalog",
]
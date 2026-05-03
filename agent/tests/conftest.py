import os
import pytest

# Unit tests never hit the real OpenAI API (all calls are mocked), but
# AsyncOpenAI() validates the key is non-empty at instantiation time.
os.environ.setdefault("OPENAI_API_KEY", "sk-test-dummy")


@pytest.fixture
def nominatim_kyiv():
    return [
        {
            "place_id": 1,
            "lat": "50.4501",
            "lon": "30.5234",
            "display_name": "Kyiv, Kyiv City, Ukraine",
            "name": "Kyiv",
            "type": "city",
            "class": "place",
            "importance": 0.9,
            "address": {"city": "Kyiv", "country": "Ukraine", "country_code": "ua"},
        }
    ]


@pytest.fixture
def nominatim_lviv():
    return [
        {
            "place_id": 2,
            "lat": "49.8397",
            "lon": "24.0297",
            "display_name": "Lviv, Lviv Oblast, Ukraine",
            "name": "Lviv",
            "type": "city",
            "class": "place",
            "importance": 0.8,
            "address": {"city": "Lviv", "country": "Ukraine", "country_code": "ua"},
        }
    ]

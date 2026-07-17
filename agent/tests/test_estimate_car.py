import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi.testclient import TestClient

from app.schema import CarEstimate, EstimateCarResponse


def _mock_parse(estimate: CarEstimate):
    response = MagicMock()
    response.choices = [MagicMock()]
    response.choices[0].message.parsed = estimate
    return AsyncMock(return_value=response)


@patch("app.nodes._openai_client")
async def test_estimate_returns_structured_result(mock_client):
    from app.nodes import estimate_car
    mock_client.beta.chat.completions.parse = _mock_parse(
        CarEstimate(makeModel="Škoda Octavia A5 1.9 TDI", fuelType="diesel", consumptionL100km=6.3))
    result = await estimate_car("skoda octavia a5 1.9 tdi 2006", "en")
    assert result.fuelType == "diesel"
    assert result.consumptionL100km == 6.3
    assert result.unknown is False


@patch("app.nodes._openai_client")
async def test_not_a_car_maps_to_unknown(mock_client):
    from app.nodes import estimate_car
    mock_client.beta.chat.completions.parse = _mock_parse(CarEstimate(unknown=True))
    result = await estimate_car("my toaster", "en")
    assert result.unknown is True
    assert result.consumptionL100km is None


@patch("app.nodes._openai_client")
async def test_llm_failure_maps_to_unknown(mock_client):
    from app.nodes import estimate_car
    mock_client.beta.chat.completions.parse = AsyncMock(side_effect=RuntimeError("boom"))
    result = await estimate_car("skoda octavia", "en")
    assert result.unknown is True


@patch("app.main.estimate_car", new_callable=AsyncMock)
def test_endpoint_returns_estimate(mock_estimate):
    mock_estimate.return_value = EstimateCarResponse(
        makeModel="Škoda Octavia A5 1.9 TDI", fuelType="diesel", consumptionL100km=6.3)
    from app.main import app
    response = TestClient(app).post(
        "/estimate-car", json={"description": "octavia 1.9 tdi", "language": "en"})
    assert response.status_code == 200
    assert response.json()["fuelType"] == "diesel"


def test_endpoint_rejects_long_description():
    from app.main import app
    response = TestClient(app).post(
        "/estimate-car", json={"description": "x" * 201, "language": "en"})
    assert response.status_code == 422

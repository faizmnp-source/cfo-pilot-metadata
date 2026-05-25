"""
CFO Pilot — Modal-hosted forecasting service.
Scales to zero, snapshot cold-start ~1-2s. Runs ARIMA (statsmodels) and
Prophet on supplied time series; returns ranked candidates by MAPE on a
holdout.

Deploy:  modal deploy modal-services/forecasting/app.py
Invoke:  POST {endpoint}/forecast  with body { history, futurePeriods, holdoutN }
"""
from __future__ import annotations
import modal
import math
from typing import List, Dict, Any

image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install("fastapi", "pydantic>=2", "numpy", "pandas", "statsmodels", "prophet")
)

app = modal.App("cfo-pilot-forecasting", image=image)


def mape(actual: List[float], predicted: List[float]) -> float:
    if not actual:
        return math.inf
    total = 0.0
    n = 0
    for a, p in zip(actual, predicted):
        if a == 0:
            continue
        total += abs((a - p) / a)
        n += 1
    return math.inf if n == 0 else (total / n) * 100


def rmse(actual: List[float], predicted: List[float]) -> float:
    if not actual:
        return math.inf
    return math.sqrt(sum((a - p) ** 2 for a, p in zip(actual, predicted)) / len(actual))


def _arima(history: List[float], future: int, order=(2, 1, 2)) -> List[float]:
    import warnings
    warnings.filterwarnings("ignore")
    from statsmodels.tsa.arima.model import ARIMA
    m = ARIMA(history, order=order).fit()
    fc = m.forecast(steps=future)
    return [float(x) for x in fc]


def _prophet(history: List[float], future: int) -> List[float]:
    import pandas as pd
    from prophet import Prophet
    # Build a monthly index — fake start at 2020-01-01
    df = pd.DataFrame({
        "ds": pd.date_range("2020-01-01", periods=len(history), freq="MS"),
        "y":  history,
    })
    m = Prophet(weekly_seasonality=False, daily_seasonality=False, yearly_seasonality=True)
    m.fit(df)
    f = m.make_future_dataframe(periods=future, freq="MS")
    out = m.predict(f).tail(future)["yhat"].tolist()
    return [float(x) for x in out]


@app.function(timeout=60, scaledown_window=60)
@modal.fastapi_endpoint(method="POST")
def forecast(payload: Dict[str, Any]):
    history     = list(map(float, payload.get("history", [])))
    future      = int(payload.get("futurePeriods", 6))
    holdout_n   = int(payload.get("holdoutN", 3))

    if len(history) <= holdout_n + 3:
        return {
            "chosen": "ARIMA",
            "values": _arima(history, future) if len(history) >= 4 else [history[-1] if history else 0] * future,
            "backtests": [],
            "note": "history too short for backtest — single ARIMA fit",
        }

    train  = history[:-holdout_n]
    actual = history[-holdout_n:]

    backtests = []
    try:
        a_pred = _arima(train, holdout_n)
        backtests.append({"method": "ARIMA",   "mape": mape(actual, a_pred), "rmse": rmse(actual, a_pred)})
    except Exception as e:
        backtests.append({"method": "ARIMA",   "mape": math.inf, "rmse": math.inf, "error": str(e)[:120]})

    try:
        p_pred = _prophet(train, holdout_n)
        backtests.append({"method": "PROPHET", "mape": mape(actual, p_pred), "rmse": rmse(actual, p_pred)})
    except Exception as e:
        backtests.append({"method": "PROPHET", "mape": math.inf, "rmse": math.inf, "error": str(e)[:120]})

    finite = [b for b in backtests if math.isfinite(b["mape"])]
    if not finite:
        return {"chosen": "ARIMA", "values": [history[-1]] * future, "backtests": backtests, "note": "all backtests errored — flat fallback"}

    winner = min(finite, key=lambda b: b["mape"])
    if winner["method"] == "ARIMA":
        values = _arima(history, future)
    else:
        values = _prophet(history, future)

    return {
        "chosen": winner["method"],
        "values": values,
        "backtests": backtests,
        "note": f"Python service picked {winner['method']} (MAPE {winner['mape']:.1f}%)",
    }

# CFO Pilot — Modal Forecasting Service

Python service that runs **ARIMA** (statsmodels) and **Prophet** (Meta) and
returns the better fit by MAPE on a holdout.

## Deploy

```
cd modal-services/forecasting
pip install modal
modal token set --token-id $MODAL_TOKEN_ID --token-secret $MODAL_TOKEN_SECRET
modal deploy app.py
```

The deploy will print an endpoint URL like
`https://<workspace>--cfo-pilot-forecasting-forecast.modal.run`.

Add that as `MODAL_ENDPOINT_URL` to Vercel env (preview / dev), then call
`POST /api/v2/forecast/v2` with `useModal: true` to enable the Python path.

## Test locally
```
modal run app.py
```

## Cost
- Scales to zero — no idle cost.
- Per-invocation ~$0.001 for the typical 12–24 point history.
- Free $30/month credit covers thousands of calls.

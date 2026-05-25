// POST /api/v2/forecast/v2
// Body: { history: number[], futurePeriods: number, holdoutN?: number, useModal?: boolean }
//
// Phase 4 forecast endpoint. Runs the JS ensemble (run-rate / linear /
// seasonal / Holt-Winters) and returns the winning method + backtest
// table + future values. When MODAL_TOKEN_ID is configured AND useModal=true,
// it will ALSO call the Modal-hosted ARIMA/Prophet service and merge those
// into the ensemble. Falls back to JS-only if Modal is unreachable.
import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/api-helpers";
import { apiError, apiResponse } from "@/lib/utils";
import { ensemble } from "@/lib/forecast/methods";

export async function POST(req: NextRequest) {
  const a = await requireAuth(req);
  if (a instanceof Response) return a;

  const body = await req.json().catch(() => null);
  if (!body || !Array.isArray(body.history)) {
    return apiError("history (array of numbers) is required", 400);
  }
  const history: number[]    = body.history.map((x: any) => Number(x) || 0);
  const futurePeriods: number = Math.max(1, Math.min(48, Number(body.futurePeriods) || 6));
  const holdoutN: number      = Math.max(2, Math.min(12, Number(body.holdoutN) || 3));
  const useModal: boolean     = Boolean(body.useModal);

  const jsResult = ensemble(history, futurePeriods, holdoutN);

  // Modal augmentation — best-effort, never blocks
  if (useModal && process.env.MODAL_TOKEN_ID && process.env.MODAL_ENDPOINT_URL) {
    try {
      const modalResp = await fetch(process.env.MODAL_ENDPOINT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Modal-Token-Id":     process.env.MODAL_TOKEN_ID!,
          "Modal-Token-Secret": process.env.MODAL_TOKEN_SECRET ?? "",
        },
        body: JSON.stringify({ history, futurePeriods, holdoutN }),
        signal: AbortSignal.timeout(15_000),
      });
      if (modalResp.ok) {
        const modal = await modalResp.json();
        return apiResponse({
          ...jsResult,
          modal,
          ensemble: {
            ...jsResult.ensemble,
            chosen: modal?.chosen ?? jsResult.ensemble.chosen,
            backtests: [...jsResult.ensemble.backtests, ...(modal?.backtests ?? [])],
            reason: `Hybrid JS + Modal (ARIMA/Prophet). Final pick: ${modal?.chosen ?? jsResult.ensemble.chosen}`,
          },
        });
      }
    } catch (_) {
      // Fall through to JS-only result
    }
  }

  return apiResponse({
    ...jsResult,
    modal: null,
    modalAvailable: Boolean(process.env.MODAL_TOKEN_ID),
  });
}

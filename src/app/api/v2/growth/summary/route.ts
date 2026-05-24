// GET /api/v2/growth/summary?yearCode=&periodScope=YTD|MONTH
//
// Dummy growth data for v1. Real wiring (Phase 2) will pull from:
//   - App Downloads:        App Store Connect API + Google Play Console API
//   - Active Users (MAU):   Posthog / Mixpanel / Amplitude SDK on the app
//   - Signup conversion:    funnel in same product analytics tool
//   - MRR / Subscribers:    Stripe / RevenueCat API
//   - Churn:                Stripe subscription events
//   - Instagram metrics:    Meta Graph API (followers, reach, engagement)
//   - NPS:                  Delighted / SatisMeter API
//
// For now everything is hardcoded but realistic for a tax-app at Dtaxdude's
// stated scale (~150K downloads, ~18K paying subscribers).

import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/api-helpers";
import { apiResponse } from "@/lib/utils";

export async function GET(req: NextRequest) {
  const a = await requireAuth(req);
  if (a instanceof Response) return a;

  // 12-month windows, semi-realistic curves.
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  // Downloads: big spike in tax season (Mar)
  const downloadsMonthly = [
    8200, 11400, 24800, 13200, 9800, 8100, 8400, 9500, 14200, 11800, 10600, 12700,
  ];
  // Active users grow then plateau seasonally
  const mauMonthly = [
    21400, 23100, 28900, 27500, 26200, 24800, 25100, 26200, 28800, 27600, 27000, 28400,
  ];
  // MRR steady growth
  const mrrMonthly = [
    142000, 148500, 162400, 169000, 173200, 175800, 178100, 180400, 184200, 184900, 185100, 186300,
  ];
  // Active subscribers
  const subsMonthly = [
    13800, 14400, 15800, 16400, 16800, 17000, 17200, 17500, 17900, 18000, 18100, 18400,
  ];

  // YTD totals
  const totalDownloads = downloadsMonthly.reduce((s, n) => s + n, 0);
  const currentMau     = mauMonthly[mauMonthly.length - 1];
  const currentMrr     = mrrMonthly[mrrMonthly.length - 1];
  const currentSubs    = subsMonthly[subsMonthly.length - 1];

  // MoM deltas
  const downloadsDelta = ((downloadsMonthly[11] - downloadsMonthly[10]) / downloadsMonthly[10]) * 100;
  const mauDelta       = ((mauMonthly[11]       - mauMonthly[10])       / mauMonthly[10])       * 100;
  const mrrDelta       = ((mrrMonthly[11]       - mrrMonthly[10])       / mrrMonthly[10])       * 100;
  const subsDelta      = ((subsMonthly[11]      - subsMonthly[10])      / subsMonthly[10])      * 100;

  return apiResponse({
    kpis: {
      downloads: {
        label: "App Downloads (YTD)",
        value: totalDownloads,
        delta: downloadsDelta,
        trend: downloadsMonthly,
        unit: "count",
      },
      mau: {
        label: "Monthly Active Users",
        value: currentMau,
        delta: mauDelta,
        trend: mauMonthly,
        unit: "count",
      },
      conversion: {
        label: "Signup → Paid",
        value: 12.4,                                     // %
        delta: 1.8,
        trend: [10.1, 10.8, 11.2, 11.6, 11.9, 11.7, 11.8, 12.0, 12.2, 12.3, 12.2, 12.4],
        unit: "pct",
      },
      mrr: {
        label: "Monthly Recurring Revenue",
        value: currentMrr,
        delta: mrrDelta,
        trend: mrrMonthly,
        unit: "usd",
      },
      activeSubscribers: {
        label: "Active Subscribers",
        value: currentSubs,
        delta: subsDelta,
        trend: subsMonthly,
        unit: "count",
      },
      churn: {
        label: "Monthly Churn",
        value: 4.1,
        delta: -0.3,                                     // improvement
        trend: [5.2, 5.0, 4.8, 4.7, 4.6, 4.5, 4.5, 4.4, 4.3, 4.3, 4.2, 4.1],
        unit: "pct",
        positiveGreen: false,                            // lower is better
      },
      nps: {
        label: "Net Promoter Score",
        value: 47,
        delta: 4,
        trend: [38, 39, 41, 42, 43, 43, 44, 44, 45, 46, 46, 47],
        unit: "score",
      },
      arpu: {
        label: "ARPU (monthly)",
        value: Math.round(currentMrr / currentSubs * 100) / 100,
        delta: 2.1,
        trend: mrrMonthly.map((m, i) => Math.round(m / subsMonthly[i] * 100) / 100),
        unit: "usd",
      },
    },

    // Downloads trend (with App Store + Play split)
    downloadsTrend: months.map((m, i) => ({
      month: m,
      iOS:     Math.round(downloadsMonthly[i] * 0.58),
      Android: Math.round(downloadsMonthly[i] * 0.42),
    })),

    // Funnel: visitor → install → signup → activate → paid
    funnel: [
      { stage: "Web Visitors",       value: 412000, pct: 100   },
      { stage: "App Installs",       value: 142800, pct: 34.7  },
      { stage: "Account Signups",    value: 64200,  pct: 15.6  },
      { stage: "First Filing",       value: 38100,  pct:  9.2  },
      { stage: "Paid Subscribers",   value: 18400,  pct:  4.5  },
    ],

    // Acquisition channels (last 90 days)
    acquisitionChannels: [
      { channel: "App Store Organic",    installs: 38420, share: 33.2, cac: 0    },
      { channel: "Instagram Ads",        installs: 26100, share: 22.5, cac: 4.20 },
      { channel: "Google Ads",           installs: 18900, share: 16.3, cac: 5.80 },
      { channel: "Referral",             installs: 12800, share: 11.0, cac: 0    },
      { channel: "YouTube Influencer",   installs:  9700, share:  8.4, cac: 8.10 },
      { channel: "Organic Search",       installs:  6240, share:  5.4, cac: 0    },
      { channel: "Other",                installs:  3800, share:  3.2, cac: 0    },
    ],

    // Retention cohort — % of users still active after N weeks
    retentionCohort: [
      { week: "W0",  pct: 100 },
      { week: "W1",  pct: 68  },
      { week: "W2",  pct: 54  },
      { week: "W3",  pct: 45  },
      { week: "W4",  pct: 39  },
      { week: "W8",  pct: 31  },
      { week: "W12", pct: 26  },
      { week: "W24", pct: 22  },
    ],

    // Instagram metrics
    instagram: {
      followers:        24320,
      followersDelta:   6.4,            // % MoM
      reachMonthly:     312400,
      reachDelta:       18.2,
      engagementRate:   5.8,            // %
      engagementDelta:  0.4,
      topPosts: [
        { id: "p1", caption: "Filed in 7 minutes 🎉 (user testimonial)", reach: 48200, likes: 3420, comments: 287, saved: 192 },
        { id: "p2", caption: "Most-missed tax deductions for freelancers", reach: 42100, likes: 2980, comments: 412, saved: 814 },
        { id: "p3", caption: "TaxDude Live: Q&A with our CPAs",            reach: 38700, likes: 1840, comments: 624, saved: 122 },
      ],
    },

    // Revenue by product line (consumer side only)
    revenueLines: [
      { product: "App Subscription — Monthly",   mrr: 84200, subscribers: 11400, color: "#06B6D4" },
      { product: "App Subscription — Annual",    mrr: 67800, subscribers:  5200, color: "#4F46E5" },
      { product: "Pro Add-on (Self-Employed)",   mrr: 22400, subscribers:  1400, color: "#F59E0B" },
      { product: "Monthly Retainer (CPA Chat)",  mrr: 11900, subscribers:   400, color: "#EC4899" },
    ],

    meta: {
      source: "stub",
      generatedAt: new Date().toISOString(),
      explainer: "Real wiring (Phase 2): App Store Connect + Google Play Console for downloads; Posthog/Mixpanel for MAU/funnel; Stripe/RevenueCat for MRR/Subs/Churn; Meta Graph API for IG; Delighted for NPS.",
    },
  });
}

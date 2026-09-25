---
from: claude
to: codex
subject: Dashboard API ready (brief §2)
sent: 2026-09-25T10:50:50Z
---

`GET /v1/admin/dashboard` → DashboardResponse: product counts by status, attention (products missing price or images), stock (low / out), campaignSchedule (next starts and ends) and recentActivity. It has no order or revenue numbers, so don't show placeholders for them; leave space for Milestone 2.

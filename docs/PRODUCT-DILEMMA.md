# The autonomy dilemma: why $250 / 0.80, and not less or more

`policy.md` §6 sets `AUTONOMY-CEILING = $250` and `AUTONOMY-CONFIDENCE = 0.80` as
defaults and asks me to tune and defend them. I'm keeping both as-is.

## Why not less

A lower ceiling (e.g. $100) or a higher confidence bar (e.g. 0.95) would push
routine, clearly policy-compliant items to a human for no safety gain:

- A 3-person team lunch ($225, within `MEAL-01`'s $75/attendee) or a typical
  SaaS renewal ($150-200, within `SAAS-01`'s $200/month cap) would need a
  human to approve something the policy already allows outright.
- None of the real risk in this system comes from the amount alone - it comes
  from the hard stops (`GLOBAL-VENDOR`, `GLOBAL-FX`, `GLOBAL-MATH`,
  `GLOBAL-FRAUD`, missing receipt/info), which fire regardless of amount or
  confidence. Lowering the ceiling doesn't catch anything those don't already
  catch - it only sends more routine work to a human.

The assignment itself warns against exactly this: escalating everything (or
near-everything) passes the safety checks but kills the product. A ceiling
low enough to rarely trigger is that failure mode in a milder disguise.

## Why not more

A higher ceiling (e.g. $500-$1,000) or a lower confidence bar (e.g. 0.6)
starts auto-approving amounts close to the policy's own escalation
boundaries - client entertainment escalates above $500, hardware becomes a
capital expense above $1,000. Near those boundaries, a small categorization
or FX-conversion error is enough to auto-approve something the policy meant
to send to a human. The cost of a wrong auto-approval also scales with the
amount, so the ceiling should stay where a single mistake is a rounding
error for the business, not a real loss.

Confidence is the one signal that captures the agent's own uncertainty about
judgment calls the hard stops don't cover (e.g. whether an item is correctly
categorized). Lowering it removes that protection specifically for the cases
where the agent itself isn't sure - not a place to loosen.

## What this leaves the ceiling actually doing

The hard stops carry the real safety weight; they apply independent of
amount or confidence. `$250` / `0.80` only auto-approves the cheap, routine
majority that was never in dispute - which is the entire point of having
autonomy at all.

## Why one ceiling, not one per category

`policy.md` already has per-category limits - `MEAL-01` ($75/attendee),
`SAAS-01` ($200/month), `HW-01/02` ($1,000, then always human), `TRAVEL-02`
($1,500, then always human). These and `AUTONOMY-CEILING` answer two
different questions, not the same one:

- **Category rules**: is this expense allowed by company policy at all?
  This holds regardless of trust in the agent - a $1,200 hardware purchase
  is a capital expense needing a human no matter how the autonomy ceiling is
  set, exactly as an accounting rule would require with no AI involved.
- **`AUTONOMY-CEILING`**: given that an expense is policy-compliant, how much
  am I willing to let the agent sign off on with zero human review? This is
  about trusting a single judgment call, not about the expense category - the
  agent can misjudge a hardware receipt exactly as easily as a meal receipt.

Because `$250` is already below several category limits (hardware, travel,
client entertainment), the ceiling is the tighter of the two checks for
those categories today, and the category rule rarely ends up being the
reason a large item is escalated. That doesn't make the category rules
redundant - they still reject/escalate items a higher ceiling would
otherwise auto-approve (e.g. a $1,200 capital hardware purchase, or business
class travel of any amount), and they stay correct independently of
whatever the ceiling is set to later.

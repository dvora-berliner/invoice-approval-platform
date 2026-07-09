import { FX_HARDSTOP_USD, isForeignCurrency } from "./fx";
import { isVendorKnown } from "./vendors";
import type { AutonomyThresholds } from "./thresholds";
import type { InvoiceForDecision, PolicyViolation } from "../types";

const RECEIPT_REQUIRED_ABOVE_USD = 25;
const MEAL_PER_ATTENDEE_USD = 75;
const SAAS_MONTHLY_CAP_USD = 200;
const HARDWARE_CAPITAL_THRESHOLD_USD = 1000;
const TRAVEL_APPROVAL_THRESHOLD_USD = 1500;
const MATH_EPSILON = 0.01;

// Only objectively computable checks - anything needing free-text judgment (MEAL-02/03,
// GLOBAL-FRAUD, TRAVEL-03) is left to the agent and merged in by router.ts.
export function computeDeterministicViolations(
  invoice: InvoiceForDecision,
  usdAmount: number,
  thresholds: AutonomyThresholds
): PolicyViolation[] {
  const violations: PolicyViolation[] = [];

  if (!isVendorKnown(invoice.vendor)) {
    violations.push({ ruleId: "GLOBAL-VENDOR", message: `Vendor "${invoice.vendor}" is not a known vendor.` });
  }

  if (isForeignCurrency(invoice.currency) && (usdAmount > thresholds.ceiling || usdAmount > FX_HARDSTOP_USD)) {
    violations.push({
      ruleId: "GLOBAL-FX",
      message: `Foreign-currency amount converts to $${usdAmount.toFixed(2)}, above the FX hard-stop.`,
    });
  }

  if (usdAmount > RECEIPT_REQUIRED_ABOVE_USD && invoice.receiptPresent !== true) {
    violations.push({ ruleId: "GLOBAL-RECEIPT", message: "Receipt is required above $25 and is missing." });
  }

  const mathViolation = checkMathReconciliation(invoice);
  if (mathViolation) violations.push(mathViolation);

  const categoryViolation = checkCategoryCompliance(invoice, usdAmount);
  if (categoryViolation) violations.push(categoryViolation);

  return violations;
}

function checkMathReconciliation(invoice: InvoiceForDecision): PolicyViolation | null {
  if (!invoice.lineItems || invoice.lineItems.length === 0) return null;

  const lineItemsTotal = invoice.lineItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const expectedTotal = lineItemsTotal + (invoice.taxAmount ?? 0);

  if (Math.abs(expectedTotal - invoice.total) > MATH_EPSILON) {
    return {
      ruleId: "GLOBAL-MATH",
      message: `Line items + tax (${expectedTotal.toFixed(2)}) do not reconcile to total (${invoice.total.toFixed(2)}).`,
    };
  }
  return null;
}

function checkCategoryCompliance(invoice: InvoiceForDecision, usdAmount: number): PolicyViolation | null {
  switch ((invoice.category ?? "").toLowerCase()) {
    case "meals": {
      if (invoice.attendees === undefined) {
        return { ruleId: "MEAL-01", message: "Attendee count is required for meal expenses and is missing." };
      }
      const perAttendee = usdAmount / invoice.attendees;
      if (perAttendee > MEAL_PER_ATTENDEE_USD) {
        return {
          ruleId: "MEAL-01",
          message: `$${perAttendee.toFixed(2)}/attendee exceeds the $${MEAL_PER_ATTENDEE_USD} cap.`,
        };
      }
      return null;
    }
    case "saas": {
      if (usdAmount > SAAS_MONTHLY_CAP_USD) {
        return { ruleId: "SAAS-01", message: `$${usdAmount.toFixed(2)} exceeds the $${SAAS_MONTHLY_CAP_USD}/month cap.` };
      }
      return null;
    }
    case "hardware": {
      if (usdAmount > HARDWARE_CAPITAL_THRESHOLD_USD) {
        return { ruleId: "HW-02", message: `$${usdAmount.toFixed(2)} is a Capital expense (> $${HARDWARE_CAPITAL_THRESHOLD_USD}) - always human-approved.` };
      }
      return null;
    }
    case "travel": {
      if (usdAmount > TRAVEL_APPROVAL_THRESHOLD_USD) {
        return { ruleId: "TRAVEL-02", message: `$${usdAmount.toFixed(2)} exceeds the $${TRAVEL_APPROVAL_THRESHOLD_USD} single-expense threshold - manager approval required.` };
      }
      return null;
    }
    default:
      return null;
  }
}

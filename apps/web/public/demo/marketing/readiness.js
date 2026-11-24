"use strict";

(() => {
  const byId = (id) => document.getElementById(id);
  let state;

  function reset() {
    state = { scanned: false, statement: "missing", wrongPeriod: false, duplicate: false, variance: "held", handedOff: false, activity: [] };
    const draft = byId("follow-up-copy");
    draft.value = draft.defaultValue;
    draft.setCustomValidity("");
    document.querySelectorAll("#month-end details").forEach((details) => { details.open = false; });
    render();
  }

  function log(message) {
    state.activity.unshift(message);
    render();
  }

  function render() {
    const resolved = Number(state.statement === "received") + Number(state.duplicate) + Number(state.variance === "resolved");
    const open = 3 - resolved;
    const ready = state.scanned && open === 0;
    byId("scan-inbox").hidden = state.scanned;
    byId("readiness-results").hidden = !state.scanned;
    byId("routine-count").textContent = state.scanned ? "124" : "—";
    byId("flag-count").textContent = state.scanned ? String(open) : "—";
    const status = byId("close-status");
    status.textContent = !state.scanned ? "Awaiting inbox scan" : ready ? "Ready for reporting" : "Blocked";
    status.dataset.ready = String(ready);
    byId("readiness-summary").textContent = ready
      ? "All three blockers cleared. The document pack is ready."
      : `${open} exception${open === 1 ? " needs" : "s need"} attention across the October checklist.`;

    const statementState = { missing: "Follow-up needed", draft: "Draft ready", sent: "Waiting for reply", received: "Cleared" };
    flag("statement", state.wrongPeriod && state.statement === "sent" ? "Wrong period flagged" : statementState[state.statement], state.statement === "received");
    byId("draft-statement").hidden = state.statement !== "missing";
    byId("statement-draft").hidden = state.statement !== "draft";
    byId("simulate-replies").hidden = state.statement !== "sent";
    byId("wrong-statement").disabled = state.wrongPeriod;
    byId("statement-note").textContent = state.statement === "received"
      ? "October’s bank statement matched Maple Studio and cleared the checklist automatically."
      : state.wrongPeriod
        ? "September was detected in the reply. October remains outstanding."
        : state.statement === "sent" ? "Follow-up recorded in the original thread." : "";

    flag("duplicate", state.duplicate ? "Cleared" : "Review needed", state.duplicate);
    byId("resolve-duplicate").disabled = state.duplicate;
    byId("duplicate-note").textContent = state.duplicate ? "Original kept. The forwarded copy was excluded from the handoff." : "";

    flag("variance", state.variance === "resolved" ? "Cleared" : state.variance === "assigned" ? "Assigned · Handoff held" : "Handoff held", state.variance === "resolved");
    byId("assign-variance").disabled = state.variance !== "held";
    byId("resolve-variance").disabled = state.variance === "resolved";
    byId("variance-note").textContent = state.variance === "resolved"
      ? "Corrected invoice received at R 2 300.00. It matches the purchase order."
      : state.variance === "assigned" ? "Accounts payable owns the follow-up. The invoice remains on hold." : "";

    byId("send-close").disabled = !ready || state.handedOff;
    byId("dockdigi-status").textContent = state.handedOff
      ? "Approved originals sent · simulated" : ready ? "Approved originals ready" : "Waiting for approved originals";
    byId("analiva-close-status").textContent = state.handedOff
      ? "October marked ready for reporting · simulated" : ready ? "Reporting readiness ready to send" : "Waiting for readiness confirmation";
    byId("close-activity").replaceChildren(...state.activity.map((text) => {
      const item = document.createElement("li");
      item.textContent = text;
      return item;
    }));
  }

  function flag(id, label, cleared) {
    const badge = byId(`${id}-state`);
    badge.textContent = label;
    badge.dataset.cleared = String(cleared);
  }

  byId("scan-inbox").addEventListener("click", () => {
    state.scanned = true;
    log("127 sample emails reviewed. 124 sorted and three exceptions flagged.");
  });

  byId("draft-statement").addEventListener("click", () => {
    state.statement = "draft";
    log("October statement follow-up drafted from the original thread.");
    byId("follow-up-copy").focus();
  });

  byId("send-statement").addEventListener("click", () => {
    const draft = byId("follow-up-copy");
    draft.setCustomValidity(draft.value.trim() ? "" : "Enter a follow-up before sending.");
    if (!draft.reportValidity()) return;
    state.statement = "sent";
    log("Follow-up approved and sent in the original thread · simulated.");
    byId("receive-statement").focus();
  });

  byId("follow-up-copy").addEventListener("input", (event) => event.target.setCustomValidity(""));

  byId("wrong-statement").addEventListener("click", () => {
    state.wrongPeriod = true;
    log("September statement received and flagged. October remains outstanding.");
  });

  byId("receive-statement").addEventListener("click", () => {
    state.statement = "received";
    log("October statement matched by client and period. The missing item cleared automatically.");
  });

  byId("resolve-duplicate").addEventListener("click", () => {
    state.duplicate = true;
    log("Forwarded INV-1042 excluded as a duplicate. The original was kept.");
  });

  byId("assign-variance").addEventListener("click", () => {
    state.variance = "assigned";
    log("R 575.00 variance assigned to accounts payable. The handoff remains held.");
  });

  byId("resolve-variance").addEventListener("click", () => {
    state.variance = "resolved";
    log("Corrected INV-1077 matched PO-0187. The handoff hold was released.");
  });

  byId("send-close").addEventListener("click", () => {
    state.handedOff = true;
    log("Approved originals handed off to DockDigi and readiness sent to analiva.app · simulated.");
  });

  byId("reset").addEventListener("click", reset);
  reset();
})();

"use strict";

const get = (id) => document.getElementById(id);
const leadForm = get("lead");
const segment = get("segment");
const variant = get("variant");
let contacts = new Map();
let current = null;

function matchingContacts() {
  return [...contacts.values()].filter((contact) => contact.consent && contact.service === segment.value);
}

function event(contact, text) {
  contact.activity.unshift(text);
}

function handOffInvoice(contact) {
  if (!contact.invoiceProcessed || !contact.reportingId || contact.invoiceReference) return;
  contact.invoiceReference = `${contact.reportingId}-1042`;
  event(contact, "Invoice INV-DEMO-1042 sent to analiva.app · simulated.");
  event(contact, `analiva.app captured invoice INV-DEMO-1042 · ${contact.invoiceReference} · simulated.`);
}

function renderInvoice() {
  const processed = Boolean(current?.invoiceProcessed);
  const captured = Boolean(current?.invoiceReference);
  get("process-invoice").disabled = !current || processed;
  get("invoice-stage-process").dataset.done = String(processed);
  get("invoice-stage-send").dataset.done = String(captured);
  get("invoice-stage-capture").dataset.done = String(captured);
  get("invoice-status").textContent = captured
    ? "Invoice handed off and captured in analiva.app in this simulation."
    : processed
      ? "Validated and queued. The handoff will run automatically after approval and company linking."
      : current
        ? "Ready to process the sample invoice."
        : "Capture the sample enquiry to assign the invoice to a company.";
  get("invoice-receipt").hidden = !captured;
  get("invoice-reference").textContent = captured ? `${current.company} · ${current.invoiceReference} · R 1 150.00` : "";
}

function render() {
  const matches = matchingContacts();
  const contact = matches.includes(current) ? current : matches[0];
  const service = segment.value.toLowerCase();
  const subject = variant.value === "a" ? `Getting started with ${service}` : `Can we talk about ${service}?`;
  get("subject").textContent = subject;
  get("body").textContent = `Hi ${contact?.name.split(" ")[0] || "there"}, would you like to book a call about ${service} for ${contact?.company || "your company"}?`;
  get("audience").textContent = `${matches.length} opted-in recipient${matches.length === 1 ? "" : "s"} in this segment`;
  get("send").disabled = !matches.some((recipient) => !recipient.sent.has(subject));
  get("reply").disabled = !current?.sent.size || current.replied;
  get("empty").hidden = Boolean(current);
  get("record").hidden = !current;
  get("approve").disabled = !current || current.approved;
  get("link").disabled = !current?.approved || Boolean(current?.reportingId);
  get("report").disabled = !current?.invoiceReference || current.reportReady;
  renderInvoice();
  get("approval").textContent = current?.approved ? "Approval simulated" : "Awaiting client approval";
  get("integration").textContent = current?.reportReady
    ? "Report-ready status received. A client update draft is on the CRM activity timeline."
    : current?.reportingId
      ? `Sample company linked · ${current.reportingId}. ${current.invoiceReference ? "Invoice captured. You can now simulate report readiness." : "Process the sample invoice to try the handoff."}`
      : current?.approved
        ? "Simulated approval recorded. You can now link the sample company."
        : current
          ? "Company linking becomes available after simulated client approval."
          : "Capture an enquiry to try the approval and linking flow.";
  if (!current) return;

  get("contact").textContent = current.name;
  get("company").textContent = current.company;
  get("details").replaceChildren(...[
    ["Email", current.email],
    ["Source", "Website enquiry"],
    ["Stage", current.replied ? "Replied · Follow-up due" : "New enquiry"],
    ["Marketing", current.consent ? "Opted in" : "Excluded"],
    ["Invoice", current.invoiceReference ? "Captured in analiva.app (simulated)" : current.invoiceProcessed ? "Queued for handoff" : "Awaiting processing"],
    ["Reporting", current.reportReady ? "Report ready" : current.reportingId ? "Company linked" : "Pending"],
  ].map(([label, value]) => {
    const row = document.createElement("div");
    const term = document.createElement("dt");
    const description = document.createElement("dd");
    term.textContent = label;
    description.textContent = value;
    row.append(term, description);
    return row;
  }));
  get("activity").replaceChildren(...current.activity.map((text) => {
    const item = document.createElement("li");
    item.textContent = text;
    return item;
  }));
}

leadForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const form = new FormData(leadForm);
  const email = form.get("email").trim().toLowerCase();
  const existing = contacts.get(email);
  current = existing || { id: contacts.size + 1, activity: [], sent: new Set() };
  Object.assign(current, {
    email,
    name: form.get("name").trim(),
    company: form.get("company").trim(),
    service: form.get("service"),
    consent: form.has("consent"),
  });
  contacts.set(email, current);
  segment.value = current.service;
  event(current, existing ? "Existing contact updated from a website enquiry." : "Website enquiry captured and company linked in the CRM.");
  render();
});

segment.addEventListener("change", render);
variant.addEventListener("change", render);

get("send").addEventListener("click", () => {
  const subject = get("subject").textContent;
  for (const contact of matchingContacts()) {
    if (contact.sent.has(subject)) continue;
    contact.sent.add(subject);
    event(contact, `Campaign send simulated · ${subject}`);
  }
  render();
});

get("reply").addEventListener("click", () => {
  current.replied = true;
  event(current, "Sample reply received. Follow-up task created for the account owner.");
  render();
});

get("process-invoice").addEventListener("click", () => {
  current.invoiceProcessed = true;
  event(current, "Invoice INV-DEMO-1042 extracted and validated in the Hub · simulated.");
  handOffInvoice(current);
  render();
});

get("approve").addEventListener("click", () => {
  current.approved = true;
  event(current, "Client approval simulated for this walkthrough.");
  render();
});

get("link").addEventListener("click", () => {
  current.reportingId = `DEMO-${String(current.id).padStart(3, "0")}`;
  event(current, `analiva.app company link simulated · ${current.reportingId}`);
  handOffInvoice(current);
  render();
});

get("report").addEventListener("click", () => {
  current.reportReady = true;
  event(current, "Report-ready event simulated. Service update drafted for staff review.");
  render();
});

get("reset").addEventListener("click", () => {
  contacts.clear();
  current = null;
  leadForm.reset();
  segment.selectedIndex = 0;
  variant.selectedIndex = 0;
  render();
});

render();

const systemTheme = matchMedia("(prefers-color-scheme: dark)");
const themeButton = get("theme");

function darkMode() {
  const theme = document.documentElement.dataset.theme;
  return theme ? theme === "dark" : systemTheme.matches;
}

function updateThemeButton() {
  themeButton.textContent = darkMode() ? "Light mode" : "Dark mode";
}

themeButton.addEventListener("click", () => {
  const theme = darkMode() ? "light" : "dark";
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem("analiva-hub-theme", theme); } catch {}
  updateThemeButton();
});
systemTheme.addEventListener("change", updateThemeButton);
updateThemeButton();

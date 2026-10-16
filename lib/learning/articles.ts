export type LearningCategory =
  | "Start here"
  | "Campaigns & tickets"
  | "Money & reconciliation"
  | "Drawing & closeout"
  | "People & permissions";

export interface LearningSection {
  title: string;
  paragraphs?: string[];
  steps?: string[];
  bullets?: string[];
}

export interface LearningArticle {
  slug: string;
  title: string;
  summary: string;
  category: LearningCategory;
  audience: "admin";
  keywords: string[];
  relatedRoutes: string[];
  related: string[];
  updatedAt: string;
  sections: LearningSection[];
}

const commonUpdatedAt = "2026-10-16";

export const LEARNING_ARTICLES: LearningArticle[] = [
  {
    slug: "prepare-campaign",
    title: "Create and prepare a raffle campaign",
    summary: "Set the raffle up correctly before activation, including timing, ticket price, disclosures, support contact, and readiness.",
    category: "Start here",
    audience: "admin",
    keywords: ["create campaign", "campaign setup", "readiness", "activate", "ticket price", "rules", "sales dates"],
    relatedRoutes: ["/campaigns"],
    related: ["enroll-players-and-inventory", "close-sales", "roles-and-scope"],
    updatedAt: commonUpdatedAt,
    sections: [
      { title: "What this is", paragraphs: ["A raffle campaign is the operating container for enrollment, ticket inventory, recorded offline sales, money reconciliation, and the drawing workflow."] },
      { title: "How to do it", steps: ["Create the raffle from Campaigns.", "Complete ticket price, prefix, sales start/close, drawing date, rules, support contact, and the organization/operator information required by readiness.", "Enroll participants and prepare ticket inventory.", "Review Activation readiness until all required items are complete.", "Use the approved lifecycle control to activate the campaign."] },
      { title: "Important rules", bullets: ["Texas pilot mode remains offline cash/check only; there is no online raffle-ticket checkout.", "Ticket disclosures lock at activation.", "Do not activate a campaign until the operating rules, prizes, dates, payment/delivery method, and drawing procedure are approved."] },
      { title: "What happens next", paragraphs: ["Once ACTIVE and within the sales window, authorized sellers can record full-price offline sales against allocated inventory."] },
    ],
  },
  {
    slug: "enroll-players-and-inventory",
    title: "Enroll players and prepare ticket inventory",
    summary: "Add eligible players to the campaign, generate campaign tickets, and allocate inventory without losing attribution history.",
    category: "Campaigns & tickets",
    audience: "admin",
    keywords: ["enroll", "players", "inventory", "allocate", "tickets available", "generate tickets"],
    relatedRoutes: ["/campaigns"],
    related: ["prepare-campaign", "ticket-status-and-number-reuse", "record-offline-sale"],
    updatedAt: commonUpdatedAt,
    sections: [
      { title: "When to use it", paragraphs: ["Use this before sellers begin recording sales, and again when an active participant needs additional unissued inventory."] },
      { title: "How to do it", steps: ["Open the campaign.", "Enroll active players individually, by team, or through the available enrollment controls.", "Generate campaign ticket inventory if unassigned stock is low.", "Allocate tickets to the participant.", "Confirm the participant card shows the intended number of available tickets."] },
      { title: "Important rules", bullets: ["Allocation does not sell or issue a ticket.", "Only AVAILABLE inventory can be allocated.", "Withdrawing a participant releases only still-allocated, unsold inventory; historical sales remain."] },
    ],
  },
  {
    slug: "record-offline-sale",
    title: "Record an offline sale",
    summary: "Issue tickets only after the seller has received the approved offline cash or check payment.",
    category: "Campaigns & tickets",
    audience: "admin",
    keywords: ["record sale", "cash", "check", "issue ticket", "buyer", "offline payment"],
    relatedRoutes: ["/campaigns", "/fundraising"],
    related: ["reverse-sale", "correct-sale", "record-money-turn-in"],
    updatedAt: commonUpdatedAt,
    sections: [
      { title: "When to use it", paragraphs: ["Use Record sale after the seller has received approved offline cash or check from the buyer."] },
      { title: "How to do it", steps: ["Open the participant from the campaign or authorized family seller view.", "Enter buyer information, quantity, and cash/check method.", "Confirm the amount matches ticket face value.", "Submit Record sale.", "Verify the issued ticket number(s) in the success receipt."] },
      { title: "What happens next", paragraphs: ["The sale, issued ticket, collection fact, and activity history are recorded together. The organization still has not necessarily received the physical money from the seller."] },
      { title: "Important rules", bullets: ["Public supporter requests are not sales and do not reserve inventory.", "Do not use this screen for online payment.", "If the result is uncertain, retry the saved submission rather than creating a new one."] },
    ],
  },
  {
    slug: "reverse-sale",
    title: "Reverse a sale",
    summary: "Void an incorrect sale without deleting history or reusing its ticket numbers.",
    category: "Campaigns & tickets",
    audience: "admin",
    keywords: ["reverse sale", "void", "refund ticket", "wrong sale", "cancel sale"],
    relatedRoutes: ["/campaigns"],
    related: ["correct-sale", "ticket-status-and-number-reuse", "record-refund"],
    updatedAt: commonUpdatedAt,
    sections: [
      { title: "When to use it", paragraphs: ["Use a reversal when the original sale must no longer count as a valid raffle sale."] },
      { title: "How to do it", steps: ["Find the sale in the campaign history.", "Choose Reverse sale.", "Enter the reason.", "Confirm the reversal.", "If the buyer still needs valid tickets, record a linked correction using fresh ticket numbers."] },
      { title: "What this does not change", bullets: ["The original sale is not deleted.", "Original ticket numbers are not reused.", "Previously recorded physical money custody is not silently erased; handle refunds, credits, or adjustments separately when needed."] },
    ],
  },
  {
    slug: "correct-sale",
    title: "Record a linked correction",
    summary: "Replace a reversed sale with a new, linked sale using fresh ticket numbers.",
    category: "Campaigns & tickets",
    audience: "admin",
    keywords: ["correct sale", "replacement", "fresh tickets", "correction", "mistake"],
    relatedRoutes: ["/campaigns"],
    related: ["reverse-sale", "ticket-status-and-number-reuse", "transfer-credit"],
    updatedAt: commonUpdatedAt,
    sections: [
      { title: "How to do it", steps: ["Reverse the incorrect original sale first.", "Use the correction/replacement action for the reversed sale.", "Enter the corrected buyer, quantity, and payment facts.", "Submit the replacement.", "Verify the replacement uses new ticket numbers and remains linked to the original history."] },
      { title: "Important rules", bullets: ["A correction is not an edit to the old row.", "Voided ticket numbers stay voided forever.", "If the organization already holds money for the original sale, use the approved credit-transfer workflow rather than recording another physical receipt."] },
    ],
  },
  {
    slug: "ticket-status-and-number-reuse",
    title: "Understand ticket status and number reuse",
    summary: "Know the difference between available, allocated, issued, and voided tickets—and why voided numbers stay retired.",
    category: "Campaigns & tickets",
    audience: "admin",
    keywords: ["ticket status", "available", "allocated", "issued", "voided", "reuse ticket number"],
    relatedRoutes: ["/campaigns"],
    related: ["enroll-players-and-inventory", "record-offline-sale", "reverse-sale"],
    updatedAt: commonUpdatedAt,
    sections: [
      { title: "Ticket states", bullets: ["AVAILABLE: campaign inventory not assigned to a participant.", "ALLOCATED: assigned to a participant but not sold.", "ISSUED: attached to a completed recorded sale.", "VOIDED: invalidated through reversal; retained in history."] },
      { title: "Important rules", bullets: ["A VOIDED number is never returned to inventory.", "Corrections issue fresh numbers.", "Drawing eligibility uses issued, unreversed tickets from the frozen population."] },
    ],
  },
  {
    slug: "record-money-turn-in",
    title: "Record cash or check turn-in",
    summary: "Record physical money received by the organization without confusing it with the earlier sale.",
    category: "Money & reconciliation",
    audience: "admin",
    keywords: ["turn in", "money received", "cash receipt", "check receipt", "seller funds"],
    relatedRoutes: ["/campaigns"],
    related: ["partial-turn-ins", "understand-money-balances", "returned-checks"],
    updatedAt: commonUpdatedAt,
    sections: [
      { title: "What this is", paragraphs: ["Recorded sales show what sellers collected from buyers. A money turn-in records what the organization physically received from a seller."] },
      { title: "How to do it", steps: ["Open Money & reconciliation for the campaign.", "Use the Record money button to jump to the highlighted action center.", "Under Choose action, select Record turn-in (full or partial).", "Choose the seller/family account and whether the organization received cash or an uncleared check.", "Enter the amount actually handed to the organization, plus the reason and optional reference.", "Save the entry and verify Money received, Money still due, and Reconciled money update as expected."] },
      { title: "Important rules", bullets: ["Do not manufacture a second receipt for money already held.", "Money actions do not change ticket validity or drawing eligibility.", "Every entry remains in history; correct mistakes with explicit follow-up entries."] },
    ],
  },
  {
    slug: "partial-turn-ins",
    title: "Handle partial turn-ins",
    summary: "Receive only part of a seller’s outstanding balance and leave the remainder visibly due.",
    category: "Money & reconciliation",
    audience: "admin",
    keywords: ["partial payment", "partial turn in", "outstanding", "money still due"],
    relatedRoutes: ["/campaigns"],
    related: ["record-money-turn-in", "understand-money-balances"],
    updatedAt: commonUpdatedAt,
    sections: [
      { title: "How it works", paragraphs: ["A receipt can cover less than the seller’s net outstanding amount. The system allocates the received amount deterministically and keeps the remainder outstanding."] },
      { title: "How to do it", steps: ["Open Money & reconciliation and use Record money to jump to the action center.", "Under Choose action, select Record turn-in (full or partial).", "Record only the amount physically turned in; you do not need a separate partial-payment mode.", "Confirm Money received increases by that amount.", "Confirm Money still due decreases but remains above zero until fully settled."] },
    ],
  },
  {
    slug: "returned-checks",
    title: "Handle uncleared and returned checks",
    summary: "Track pending checks, returned checks, and exceptions without silently voiding valid raffle tickets.",
    category: "Money & reconciliation",
    audience: "admin",
    keywords: ["check bounced", "returned check", "uncleared", "check issue", "exception"],
    relatedRoutes: ["/campaigns"],
    related: ["record-money-turn-in", "understand-money-balances", "approved-adjustment"],
    updatedAt: commonUpdatedAt,
    sections: [
      { title: "How it works", paragraphs: ["A check receipt can remain uncleared until its outcome is known. If it returns, the money is removed from received/reconciled balances and a check exception is tracked."] },
      { title: "How to record a returned check", steps: ["Open Money & reconciliation and use Record money to jump to the action center.", "Under Choose action, select Record returned check.", "Select the original check receipt, add the reason, and submit.", "Record replacement money separately when it is actually received.", "Resolve the financial issue only after the outstanding amount is settled or an authorized adjustment has been approved."] },
      { title: "Important rules", bullets: ["A returned check does not automatically void the raffle ticket.", "Returned-check handling is a money-custody workflow, not a ticket reversal.", "The original receipt and returned-check event remain in immutable history."] },
    ],
  },
  {
    slug: "understand-money-balances",
    title: "Understand expected, received, due, and reconciled money",
    summary: "Read the money dashboard without treating sales, receipts, cleared funds, and deposits as the same thing.",
    category: "Money & reconciliation",
    audience: "admin",
    keywords: ["expected money", "received money", "outstanding", "reconciled", "money still due", "balances"],
    relatedRoutes: ["/campaigns"],
    related: ["record-money-turn-in", "partial-turn-ins", "record-deposit"],
    updatedAt: commonUpdatedAt,
    sections: [
      { title: "Key terms", bullets: ["Recorded sales (total): gross recorded seller sales.", "Money expected: net amount the seller is accountable to turn in after reversals/approved relief.", "Money received: cash/check receipts held by the organization, net of refunds/returned checks.", "Money still due: expected money not yet covered by receipts or approved adjustments.", "Reconciled money: received money excluding uncleared checks.", "Deposits recorded: historical deposit evidence, not a bank-account balance."] },
      { title: "Where to take action", paragraphs: ["Use the Record money button at the top of the Money & reconciliation page to jump to the highlighted Record money received / adjustments action center. Choose the specific action there instead of editing history directly."] },
    ],
  },
  {
    slug: "transfer-credit",
    title: "Transfer a credit",
    summary: "Move already-held money from an overpaid/reversed source sale to another same-seller outstanding sale.",
    category: "Money & reconciliation",
    audience: "admin",
    keywords: ["credit transfer", "overpayment", "move money", "correction credit"],
    relatedRoutes: ["/campaigns"],
    related: ["correct-sale", "record-refund", "approved-adjustment"],
    updatedAt: commonUpdatedAt,
    sections: [
      { title: "When to use it", paragraphs: ["Use a credit transfer when the organization already holds money that should be applied to another same-seller outstanding sale, commonly after a reversal and linked correction."] },
      { title: "Important rules", bullets: ["A credit transfer does not create a new physical receipt.", "The destination must have outstanding money.", "The source must have available held overpayment/credit."] },
    ],
  },
  {
    slug: "record-refund",
    title: "Record a refund",
    summary: "Record money physically returned without deleting the original receipt or sale history.",
    category: "Money & reconciliation",
    audience: "admin",
    keywords: ["refund", "return money", "buyer refund", "seller refund"],
    relatedRoutes: ["/campaigns"],
    related: ["reverse-sale", "transfer-credit", "understand-money-balances"],
    updatedAt: commonUpdatedAt,
    sections: [
      { title: "How to do it", steps: ["Open Money & reconciliation.", "Select the relevant receipt and source sale.", "Choose Refund.", "Enter the amount, reason, and reference if used.", "Verify the money history and balances after saving."] },
      { title: "Important rules", bullets: ["Refunding money is separate from reversing ticket validity.", "The original receipt remains part of immutable history."] },
    ],
  },
  {
    slug: "approved-adjustment",
    title: "Record an approved balance adjustment",
    summary: "Use authorized liability relief when an outstanding amount is formally approved rather than physically received.",
    category: "Money & reconciliation",
    audience: "admin",
    keywords: ["adjustment", "write off", "balance relief", "approved adjustment"],
    relatedRoutes: ["/campaigns"],
    related: ["returned-checks", "understand-money-balances"],
    updatedAt: commonUpdatedAt,
    sections: [
      { title: "When to use it", paragraphs: ["Use an adjustment only when an authorized approver has approved changing the seller’s financial liability."] },
      { title: "Important rules", bullets: ["An adjustment is not a receipt.", "Adjustments stay visible in immutable money history.", "Use a reason that explains the approval basis."] },
    ],
  },
  {
    slug: "record-deposit",
    title: "Record deposit evidence",
    summary: "Record that reconciled funds were deposited while keeping deposit history separate from bank balance accounting.",
    category: "Money & reconciliation",
    audience: "admin",
    keywords: ["deposit", "bank deposit", "deposit evidence", "cash deposit", "check deposit"],
    relatedRoutes: ["/campaigns"],
    related: ["record-money-turn-in", "understand-money-balances"],
    updatedAt: commonUpdatedAt,
    sections: [
      { title: "How it works", paragraphs: ["A deposit entry documents movement of funds already received. It does not create new sales or new receipts."] },
      { title: "Important rules", bullets: ["Uncleared checks cannot be deposited in this workflow.", "Returned checks cannot be deposited.", "Deposits recorded are historical evidence, not a live bank balance."] },
    ],
  },
  {
    slug: "close-sales",
    title: "Close sales",
    summary: "End ticket selling before freezing the drawing population.",
    category: "Drawing & closeout",
    audience: "admin",
    keywords: ["close sales", "campaign closed", "sales close", "stop selling"],
    relatedRoutes: ["/campaigns"],
    related: ["freeze-drawing", "prepare-campaign"],
    updatedAt: commonUpdatedAt,
    sections: [
      { title: "How to do it", steps: ["Confirm the disclosed sales cutoff has been reached or the approved operator decision to close is ready.", "Use the campaign lifecycle control to move the campaign to CLOSED.", "Review drawing readiness before freezing."] },
      { title: "Important rules", bullets: ["Drawing freeze requires a closed campaign.", "Closing sales does not itself reconcile outstanding seller money.", "The approved drawing remains physical/external for the pilot."] },
    ],
  },
  {
    slug: "freeze-drawing",
    title: "Freeze the drawing population",
    summary: "Create the immutable snapshot of eligible issued, unreversed tickets used for the approved drawing.",
    category: "Drawing & closeout",
    audience: "admin",
    keywords: ["freeze drawing", "drawing snapshot", "eligible tickets", "frozen population"],
    relatedRoutes: ["/campaigns"],
    related: ["close-sales", "export-drawing", "record-external-result"],
    updatedAt: commonUpdatedAt,
    sections: [
      { title: "Before you freeze", bullets: ["Campaign sales must be CLOSED.", "Drawing readiness blockers must be cleared.", "Approved prize readiness and drawing arrangements must be confirmed."] },
      { title: "What happens", paragraphs: ["The system creates an immutable drawing snapshot, hashes the manifest and entries, and records the freeze event."] },
      { title: "Important rules", bullets: ["The application does not randomly select a winner.", "Ticket-changing operations are blocked while the current drawing snapshot is frozen unless an authorized reopen occurs.", "Money outstanding does not by itself change ticket eligibility."] },
    ],
  },
  {
    slug: "export-drawing",
    title: "Export the drawing population",
    summary: "Download the private frozen population for the approved external/physical drawing and retain its verification evidence.",
    category: "Drawing & closeout",
    audience: "admin",
    keywords: ["export drawing", "csv", "json manifest", "drawing file", "manifest hash"],
    relatedRoutes: ["/campaigns"],
    related: ["freeze-drawing", "record-external-result", "certify-drawing"],
    updatedAt: commonUpdatedAt,
    sections: [
      { title: "How to do it", steps: ["Open Drawing after the population is frozen.", "Verify snapshot integrity is green.", "Download the authorized CSV and/or JSON manifest.", "Retain the exported files and manifest hash in the approved drawing-record location."] },
      { title: "Important rules", bullets: ["Drawing exports contain private buyer information and must be handled privately.", "Use the current frozen snapshot, not a superseded/reopened version.", "The export record preserves the file checksum/reporting evidence."] },
    ],
  },
  {
    slug: "record-external-result",
    title: "Record the physical or external drawing result",
    summary: "Record evidence for the approved drawing after using the frozen population outside the application.",
    category: "Drawing & closeout",
    audience: "admin",
    keywords: ["winner", "drawing result", "physical drawing", "external drawing", "witnesses"],
    relatedRoutes: ["/campaigns"],
    related: ["freeze-drawing", "export-drawing", "certify-drawing"],
    updatedAt: commonUpdatedAt,
    sections: [
      { title: "How to do it", steps: ["Conduct the approved physical/external drawing from the current frozen population.", "Open Drawing and choose the result action.", "Record actual drawing time, location, operator, witnesses, method, winning ticket number, result details, and evidence reference if used.", "Confirm the winning ticket exists in the frozen snapshot."] },
      { title: "Important rules", bullets: ["The result is a new immutable fact; it does not rewrite the original ticket or sale.", "The drawing time must follow the disclosed drawing date and snapshot freeze and cannot be in the future."] },
    ],
  },
  {
    slug: "certify-drawing",
    title: "Certify the drawing",
    summary: "Have the authorized certifier verify the frozen population and recorded external result before finalizing the campaign as drawn.",
    category: "Drawing & closeout",
    audience: "admin",
    keywords: ["certify", "drawing certification", "director", "drawn", "finalize"],
    relatedRoutes: ["/campaigns"],
    related: ["record-external-result", "freeze-drawing"],
    updatedAt: commonUpdatedAt,
    sections: [
      { title: "Before certification", bullets: ["The current snapshot must verify successfully.", "At least one physical/external result must be recorded.", "The result hashes and audit receipts must verify."] },
      { title: "What happens next", paragraphs: ["Certification records the certifier, manifest hash, result count, and ordered result hash. Only after this gate can the authorized lifecycle control finalize the campaign as DRAWN."] },
    ],
  },
  {
    slug: "roles-and-scope",
    title: "Understand roles, permissions, family scope, and captain scope",
    summary: "Understand what people can see and do without assuming a role name automatically grants every related action.",
    category: "People & permissions",
    audience: "admin",
    keywords: ["roles", "permissions", "family scope", "captain scope", "admin", "finance", "director", "access"],
    relatedRoutes: ["/settings", "/settings/members"],
    related: ["prepare-campaign", "record-money-turn-in"],
    updatedAt: commonUpdatedAt,
    sections: [
      { title: "How access works", paragraphs: ["The application authorizes capabilities through organization permissions and scope. Role names are convenient labels; the permission checks and RLS policies are authoritative."] },
      { title: "Important scope rules", bullets: ["A family seller can see and sell only for linked family players.", "A team captain can read only assigned-team fundraising scope and does not gain family selling or private supporter-contact access from captain scope.", "Finance/reconciliation capability is separate from ticket selling.", "Drawing certification is separate from ordinary drawing management.", "Combining roles must not broaden a family seller into team-wide selling."] },
      { title: "Admin practice", paragraphs: ["Grant the minimum roles required for the person’s responsibilities, then verify the resulting view using the same screens they will operate."] },
    ],
  },
];

const bySlug = new Map(LEARNING_ARTICLES.map((article) => [article.slug, article]));

export function getLearningArticle(slug: string): LearningArticle | undefined {
  return bySlug.get(slug);
}

export function searchLearningArticles(query: string): LearningArticle[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return LEARNING_ARTICLES;
  return LEARNING_ARTICLES.filter((article) => {
    const haystack = [
      article.title,
      article.summary,
      article.category,
      ...article.keywords,
      ...article.sections.flatMap((section) => [
        section.title,
        ...(section.paragraphs ?? []),
        ...(section.steps ?? []),
        ...(section.bullets ?? []),
      ]),
    ].join(" ").toLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
}

export const LEARNING_CATEGORIES: LearningCategory[] = [
  "Start here",
  "Campaigns & tickets",
  "Money & reconciliation",
  "Drawing & closeout",
  "People & permissions",
];

# Aspire Raffle Hub — Controlled Pilot Readiness

_Last updated: 2026-10-20_

## Purpose

Move Aspire Raffle Hub from accepted synthetic staging to a controlled real-world pilot without mixing real family/money records into staging or relaxing the legal, security, custody, drawing, or audit controls already proven.

## Current decision

**STAGING PRODUCT ACCEPTANCE: PASS**

**LIVE / REAL-MONEY PILOT: NO-GO until the blocking gates below are explicitly cleared.**

The staging operator rehearsal is complete through DRAWN with clean financial reconciliation, immutable drawing evidence, and verified audit chains.

## Environment strategy

### Keep staging synthetic

Current staging:

- Netlify: `aspire-raffle-hub-staging`
- Supabase: `Aspire Raffle Hub Staging` (`ixhpidqhqzbpfbklofrs`)
- synthetic/rehearsal data only
- full CI + Hosted QA + security gate
- no real family or money records

Do **not** repurpose this database for the real pilot.

### Production shell already exists

Existing Netlify project:

- project: `aspirerafflehub`
- current deploy: old manual/static one-page deploy from 2026-10-02
- no site environment variables configured
- no current Raffle Hub application/runtime attached
- **director decision 2026-10-20: use this project as the production Raffle Hub shell**

Recommendation: keep the Netlify project name and later attach a branded custom domain (for example a raffle subdomain) rather than creating another Netlify project.

### Production Supabase does not yet exist

Current Supabase account contains staging projects only for Raffle Hub, Studio, and Aspire One.

Director decision 2026-10-20: create **Aspire Raffle Hub Production** in the same Supabase organization as Raffle Hub Staging.

Supabase quoted the additional project at **$10/month**. Creation is pending explicit approval of that recurring cost.

The production project must remain separate from staging and start from migrations only, with no synthetic staging rows copied into it.

Never point the production Netlify site at the staging Supabase project.

## Gate A — Texas raffle authority and legal entity

Primary law: Texas Occupations Code Chapter 2002, Charitable Raffle Enabling Act (CREA).

Primary sources:

- Texas Legislature, Chapter 2002: https://statutes.capitol.texas.gov/GetStatute.aspx?Code=OC&Value=2002.002
- Texas Attorney General raffle guidance: https://www.texasattorneygeneral.gov/consumer-protection/charities-nonprofits/charitable-raffles-and-casinopoker-nights

### A1. Qualified organization — BLOCKING

Aspire's current entity chain, as confirmed by the directors on 2026-10-20:

- federal tax-exempt history/name: **FC Cypress Inc**
- current Texas legal entity name: **Aspire Sports Group**
- intended raffle operator: **Aspire Sports Group**, subject to retaining the name-change/tax-exemption evidence tying the two names to the same exempt organization

Texas permits a raffle only for a qualified organization.

For a qualified nonprofit organization, Chapter 2002 requires, among other things:

- qualifying nonprofit structure
- no distribution of income to members/officers/governing body except reasonable compensation
- existence for the preceding three years
- applicable political/lobbying restrictions
- federal tax exemption under Section 501(c)

Public IRS-derived records currently indicate:

- legal name: **FC Cypress Inc**
- EIN: **81-3797096**
- 501(c)(3)
- tax exempt since December 2016
- current public filing describes Aspire Futbol Club youth soccer activity

This is a strong eligibility lead but is **not the final legal sign-off**.

Required evidence before live raffle:

- original/current IRS determination or TEOS evidence for the exempt organization
- Texas certificate of amendment / filed name-change evidence showing **FC Cypress Inc → Aspire Sports Group**
- current Texas entity record showing **Aspire Sports Group**
- IRS name-change reporting evidence and preferably an IRS affirmation letter reflecting **Aspire Sports Group**
- confirmation that the Aspire-branded raffle may be conducted by **Aspire Sports Group**
- confirmation that its organizational activity/proceeds satisfy CREA charitable-purpose requirements
- confirmation of the number of raffles already awarded by that entity in the current calendar year

Owner: Aspire board/directors + Texas counsel/qualified legal reviewer.

### A2. Raffle frequency — BLOCKING

CREA currently allows a qualified organization to award prizes in no more than four raffles in a calendar year.

Before campaign activation, record:

- raffle sequence number for the calendar year
- prior raffle award dates
- confirming operator/entity

### A3. Use of proceeds — BLOCKING

All raffle-ticket proceeds must be spent for the charitable purposes of the qualified organization.

Before launch:

- board/operator approves the intended use of proceeds
- official rules state the intended charitable purpose
- accounting/custody procedure preserves the ability to trace proceeds

### A4. Promotion and sale method — BLOCKING

CREA restricts statewide promotion and sale. Texas OAG guidance states that statewide Internet ticket sales are generally thought to fall within the prohibition.

Aspire pilot policy:

- **no online raffle checkout**
- **no public Internet ticket reservation**
- **no automatic ticket issuance from the public supporter page**
- public seller link remains request-only
- actual sale/collection remains an authorized offline process

Do not add Stripe/public raffle checkout without new Texas legal review.

### A5. Seller/organizer compensation — BLOCKING

CREA generally prohibits directly or indirectly compensating a person for organizing/conducting a raffle or selling/offering raffle tickets, subject to narrow statutory exceptions.

Before offering player/team seller prizes, credits, commissions, showcase discounts, or performance incentives tied to raffle sales, obtain legal confirmation that the incentive structure is permitted.

Default pilot posture: **no compensation/commission tied to raffle ticket sales.**

### A6. Ticket disclosures — PRODUCT + LEGAL BLOCKER

Texas requires the following to be printed on each raffle ticket sold/offered:

1. name of organization conducting the raffle
2. organization address or address of a named officer
3. ticket price
4. general description of each prize worth more than $10
5. date prizes will be awarded

The current Raffle Hub sale confirmation shows issued ticket number(s) and amount but is **not yet a compliance-ready ticket artifact containing all five disclosures**.

Before live ticket sales, decide the approved delivery model:

- physical preprinted ticket, or
- app-generated printable ticket/receipt approved by counsel as satisfying the statute

Then make the application/physical inventory match that approved model.

### A7. Prize rules — BLOCKING

CREA:

- prohibits a money/cash prize
- generally caps a prize purchased/provided for consideration by the organization at $75,000
- contains a separate residential-dwelling limit in current statute
- requires the organization to possess/own the prize before the raffle, or post the required bond with the county clerk

Before activation:

- prize description
- fair value
- donated vs purchased
- possession/ownership evidence or bond evidence
- no prohibited cash prize

Do not rely on older FAQ dollar amounts where they conflict with current statutory text; use the current statute and counsel.

### A8. Drawing date / delayed drawing — BLOCKING

Before selling/offering tickets, the organization must set the prize-award date.

If it cannot award on that date, current law permits a replacement date within the statutory window; failure to award within that window triggers refund/offer-to-refund obligations.

Raffle Hub already locks the disclosed drawing date after activation. Keep that control.

## Gate B — Product compliance changes

### B1. Compliance-ready ticket artifact — REQUIRED

Build/verify a printable buyer ticket/receipt containing:

- raffle operator legal name
- operator/officer address
- ticket number
- ticket price
- prize description(s)
- disclosed drawing date
- optional campaign/support contact
- clear offline-payment acknowledgement

The canonical ticket number must be the same immutable number used by the ticket ledger.

### B2. Operator identity separation — REQUIRED

Campaign setup must distinguish:

- Aspire display/brand name
- legal raffle operator
- legal/operator address
- support contact

Activation should fail if legally required ticket fields are missing.

### B3. Raffle-year counter / operator attestation — REQUIRED BEFORE BROADER ROLLOUT

For controlled pilot, a documented manual pre-launch checklist is acceptable.

Before multi-campaign production use, add:

- calendar-year raffle count/attestation
- prior raffle dates/IDs where applicable
- operator confirmation before activation

### B4. Public supporter page — KEEP CURRENT MODEL

Current request-only design is the approved pilot baseline:

- no payment
- no ticket issuance
- no ticket hold/reservation
- no buyer/private balance exposure
- private seller follow-up

Any change to public checkout requires legal re-review.

## Gate C — Production infrastructure

### C1. Separate Supabase Production — BLOCKING

Create a dedicated production Supabase project after account/cost confirmation.

Requirements:

- same region unless a deliberate reason changes it
- migrations applied from a clean database
- no copied synthetic staging rows
- leaked-password protection enabled
- publishable key used in browser
- secret/service key server-only
- custom SMTP before family invitation rollout
- backup/recovery settings confirmed
- security advisors reviewed
- production logs/monitoring confirmed

### C2. Production Netlify — BLOCKING

Use the existing `aspirerafflehub` project only after confirming it is the intended production site.

Current state:

- old manual static deploy
- no env vars
- no current application connection

Production setup needs:

- deploy the accepted Raffle Hub commit/release
- point only to Production Supabase
- production `NEXT_PUBLIC_SITE_URL`
- server-only Supabase secret
- production domain decision
- HTTPS verification
- hosted smoke test
- rollback plan

### C3. Security controls — REQUIRED

Already proven in staging:

- least-privilege browser publishable key
- service secret never exposed to browser
- RLS + permission-checked RPCs
- leaked-password protection
- deny-by-default public function ACL posture
- hash-chained audit/campaign/ticket/money history
- immutable drawing evidence
- basic response headers: frame deny, content-type nosniff, strict referrer policy, permissions policy
- zero observed 5xx responses in the reviewed staging window

Production review still needs:

- independent review of the 60 intentionally authenticated SECURITY DEFINER RPCs by class/risk, not blind revocation
- CSP/HSTS production-header decision and regression testing
- SMTP configuration
- backup/restore verification
- incident-response contacts
- key rotation procedure
- dependency/security audit on final release commit

Performance-only advisor findings (unindexed FKs / multiple permissive policies / unused indexes) should be triaged before scale but are not, by themselves, a controlled small-pilot security blocker.

## Gate D — Cash/check operating procedure

Before real collections, assign named human owners for:

### D1. Seller handoff

- who may accept cash/check
- when seller/family must turn funds in
- required reference/receipt
- no money event without physical custody change

### D2. Team/captain handoff

- captains monitor only unless separately authorized
- no automatic custody permission from captain role
- schedule/frequency for collection handoff

### D3. Finance receipt

- two-person count for material cash totals where practical
- receipt recorded at actual handoff
- check reference captured
- discrepancy/shortage procedure
- no editing/deleting ledger history

### D4. Deposit

- who deposits
- target deposit timeline
- bank/deposit reference retained
- deposit evidence storage location
- application event recorded

### D5. Returned check

- named owner for bank notice
- returned-check event recorded
- ticket validity remains separate unless an authorized sale correction is performed
- replacement payment recorded as a new custody fact
- exception resolution documented

## Gate E — Drawing evidence procedure

Before activation:

- named drawing operator
- named certifier/Director
- required witness count
- approved physical/external method
- drawing location
- evidence storage location
- retention period
- who retains frozen CSV + JSON + manifest hash
- who records the observed result
- who certifies
- incident/dispute procedure

No in-app random winner selection.

## Gate F — Pilot launch size

Recommended first real pilot:

- one campaign only
- one legal operator
- limited team/player subset
- offline cash/check only
- low ticket volume relative to full club
- one designated finance operator + backup
- one drawing manager + separate certifier where practical
- daily reconciliation during sales window
- explicit stop/go checkpoint before expanding club-wide

## Go / No-Go checklist

Real-money pilot is **GO** only when all are true:

- [ ] legal raffle operator confirmed
- [ ] 501(c)/entity evidence retained
- [ ] calendar-year raffle count confirmed
- [ ] use-of-proceeds approved
- [ ] official rules approved
- [ ] prize legality/ownership/bond evidence approved
- [ ] ticket disclosure/delivery model approved
- [ ] no prohibited seller compensation/incentive
- [ ] offline sale/promotion model approved
- [ ] production Supabase created/configured
- [ ] production Netlify deployed/configured
- [ ] production auth/SMTP tested
- [ ] production security advisors reviewed
- [ ] backup/recovery confirmed
- [ ] cash/check custody owners assigned
- [ ] returned-check owner assigned
- [ ] deposit evidence process assigned
- [ ] drawing operator/witness/certifier assigned
- [ ] evidence-retention location assigned
- [ ] independent developer/security review completed
- [ ] production smoke + role matrix passed
- [ ] board/director explicit GO recorded

## Immediate next actions

1. Confirm the exact legal operator: **FC Cypress Inc** or another entity.
2. Obtain/retain its IRS determination/TEOS evidence and Texas entity evidence.
3. Confirm that `aspirerafflehub` is the intended production Netlify project.
4. Create a dedicated Raffle Hub Production Supabase project after cost/account confirmation.
5. Build the compliance-ready ticket artifact and add legal activation validation.
6. Draft the official rules/prize/disclosure packet for legal review.
7. Fill in named custody/drawing owners.
8. Run an independent security/developer review on the release candidate.
9. Deploy to production infrastructure with no live campaign activated.
10. Run production smoke/role checks, then board/director GO/NO-GO.

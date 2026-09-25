# Phase 0 Client Inputs and Account Ownership Checklist

Status: Started - awaiting client confirmations  
Project: Kleawip Ecommerce Platform  
Owner: Kleawip  
Delivery partner: MarketiX Studio  
Last updated: 24 September 2026

## 1. Phase 0 objective

Phase 0 establishes the client-owned accounts, business information, product data and approved operating rules required before interface design or production development begins.

No password, recovery code, API secret, KYC document or live customer information may be stored in this repository or in Graphify.

## 2. Recommended client identity

### Proposed Phase 0 direction

Use a dedicated client-controlled Gmail account for the platform-owner identity. Suggested names, subject to availability:

- `kleawip.platform@gmail.com`
- `kleawip.digital@gmail.com`

The exact address is To be confirmed after the client creates it. The address is for ownership and recovery, not public customer communication.

This avoids an additional mailbox subscription at launch, but it must not be described as impossible to expire. Google's inactive-account policy allows a personal Google Account and its data to be deleted after at least two years without activity. Regular authorised use, current recovery information and an ownership review prevent this becoming an unmanaged account.

Requirements:

- The client controls the password, recovery phone and recovery email.
- Two-factor authentication is enabled before any platform is created.
- Recovery codes are stored by the client in a secure password manager or offline record.
- At least two authorised client contacts know where the recovery record is held.
- The account is reviewed and actively used at least every six months.
- MarketiX does not keep the shared password after invitations are configured.
- Platform ownership uses organisations and workspaces so access can be transferred even if the sign-in address changes later.

### Optional later upgrade

Kleawip may later create `digital@kleawip.com` or `technology@kleawip.com` and register it as a Google Account or Google Workspace identity. Google permits a Google Account to use an existing non-Gmail address. This is more professional but is not required to begin Phase 0.

### Addresses that should not own infrastructure

- A MarketiX Studio email address.
- A developer's personal Gmail account.
- The public `support@kleawip.com` inbox.
- A mailbox shared by multiple employees using one password.

## 3. Ownership model

The client owns each organisation, workspace, project, domain, billing profile and production account. MarketiX receives only the access required to design, build, test and deploy.

| Platform | Client-owned structure | Client role | MarketiX access | Phase 0 requirement |
| --- | --- | --- | --- | --- |
| Google identity | Dedicated client-controlled Google Account | Primary owner and recovery controller | No password sharing | Create and secure first |
| GitHub | Kleawip organisation with private repository | Organisation owner | Team member or repository administrator | Create organisation, invite MarketiX, require 2FA |
| Vercel | Kleawip team and storefront project | Team owner and billing owner | Member/developer access appropriate to plan | Confirm plan, create team and invite MarketiX |
| Railway | Kleawip workspace and backend project | Workspace admin and billing owner | Member during development | Create workspace, invite MarketiX and enable 2FA where plan permits |
| Hostinger/domain | Existing Kleawip account | Account owner | Delegated access or client-assisted DNS changes | Confirm domain, DNS and renewal ownership |
| Razorpay | Kleawip merchant account | Merchant/KYC and settlement owner | Technical integration access only | Complete KYC and provide test-mode access securely |
| Shipping | Kleawip Shiprocket/DTDC commercial account | Contract, pickup and billing owner | Technical/operations access | Confirm provider, API access and pickup location |
| Transactional email | Kleawip sender account/domain | Account and domain owner | Technical configuration access | Select provider and authenticate sending domain |
| Object/media storage | Kleawip project/account | Billing and data owner | Project-scoped technical access | Select during architecture approval |
| Monitoring/error tracking | Kleawip organisation/project | Owner | Developer access | Select before staging |

## 4. Account creation order

1. Create and secure the client platform-owner identity.
2. Confirm Hostinger/domain ownership and access recovery.
3. Create the GitHub organisation and private repository.
4. Add two organisation owners where possible for continuity; at least one must be an authorised Kleawip representative.
5. Require two-factor authentication for GitHub access.
6. Invite MarketiX through individual GitHub accounts; do not share the owner password.
7. Create the Vercel team under the client owner and connect only the approved GitHub repository.
8. Create the Railway workspace under the client owner and invite MarketiX as a member rather than workspace admin unless administration is temporarily required.
9. Add the client's billing method directly to Vercel, Railway and other paid providers.
10. Create separate Preview/Staging and Production environments.
11. Complete Razorpay and shipping-provider onboarding in the client's legal business identity.
12. Add integrations using project-scoped credentials and protected environment variables.

## 5. GitHub requirements

- Organisation-owned private repository, not a repository under a developer's personal profile.
- Recommended organisation name: `kleawip` or an approved business variation.
- Suggested repository name: `kleawip-commerce`.
- Two client-side owners where practical. If the client has only one authorised owner, MarketiX may be a temporary second owner during setup and must be downgraded at handover.
- MarketiX developers use their own GitHub accounts.
- Two-factor authentication is required.
- Main branch protection, pull-request review and automated checks before merge.
- Production deployment is restricted to approved branches/workflows.
- Secrets, KYC records, `.env` files and production exports are never committed.
- Recovery and handover are tested before launch.

## 6. Vercel requirements

- Team and storefront project created under the client's owner identity.
- MarketiX invited using individual accounts if the selected plan supports team collaboration.
- Client remains owner of billing, domains and production configuration.
- GitHub organisation/repository access limited to the Kleawip project.
- Preview deployment for proposed changes.
- Staging deployment for complete operational testing.
- Production deployment only from the approved release branch.
- Environment variables separated by Preview, Staging and Production.
- Production secrets visible only to roles that require them.
- Current plan, collaboration limits and usage limits confirmed before implementation.

## 7. Railway requirements

- Railway workspace represents Kleawip, not MarketiX or an individual developer.
- Client owner is Workspace Admin and controls billing.
- MarketiX receives Member access for development; Deployer access may be used later for restricted deployment-only roles.
- Workspace-level tokens are avoided for routine integrations.
- CI/CD uses the narrowest project/environment-scoped credential available.
- Database, cache, worker and internal services remain on private networking unless public access is required.
- Preview/Staging and Production variables remain separate.
- Production secrets are protected and never stored in GitHub.
- Database backup, restore and export ownership is confirmed before launch.
- Two-factor authentication enforcement is enabled when available on the selected plan.

## 8. Client business and KYC inputs

| Input | Status | Client action |
| --- | --- | --- |
| Registered business/legal name | To be confirmed | Supply exact invoice/KYC spelling |
| GSTIN and GST certificate | To be confirmed | Supply securely outside the repository |
| PAN and authorised-signatory information | To be confirmed | Supply directly to relevant provider |
| Registered and operational address | To be confirmed | Confirm invoice and legal display address |
| Warehouse/pickup address | To be confirmed | Confirm contact, hours and pickup instructions |
| Settlement bank account | To be confirmed | Add directly to payment/shipping accounts |
| Customer support phone and email | To be confirmed | Confirm public contact details |
| Escalation contact | To be confirmed | Name authorised operational decision-maker |
| Invoice numbering and tax rules | To be confirmed | Approve with accountant/adviser |

KYC documents and settlement information must be uploaded directly by the client to the relevant provider. They must not be sent through GitHub, Graphify or ordinary project files.

## 9. Product and catalogue inputs

The client must provide one approved source spreadsheet for the ten launch products.

Required per base product:

- Product name and category.
- Customer-facing description and benefits.
- Material, weave, edge, application and care instructions.
- Approved product claims and supporting evidence.
- HSN code and GST rate.
- Product images, videos and usage rights.

Required per purchasable variant/SKU:

- SKU code.
- GSM, size, colour and pack quantity.
- MRP and selling price.
- Opening stock and low-stock threshold.
- Packed weight and package dimensions.
- Variant-specific images where applicable.
- COD, partial-COD, offer and return eligibility.

No placeholder value becomes production catalogue data without written client approval.

## 10. Bulk purchase and client showcase content

### Bulk / Wholesale Enquiry

The original ecommerce scope already includes a Bulk / Wholesale Enquiry page. Phase 0 defines its behaviour; it is not counted as another page.

- [ ] Confirm enquiry-only or online bulk checkout.
- [ ] Confirm minimum order quantity by product/variant.
- [ ] Confirm quantity breaks and who can approve negotiated pricing.
- [ ] Confirm whether business/GST details are required to request or receive a quote.
- [ ] Confirm lead owner, response target and enquiry status flow.
- [ ] Confirm delivery zones, shipping quote method, payment and tax terms.
- [ ] Confirm whether bulk enquiries should be restricted to logged-in accounts.
- [ ] Supply approved form fields and the business inbox/team that receives enquiries.

### Clients We Work With

The expansion adds a customer-facing page to present Kleawip's approved client relationships and business credibility.

- [ ] Supply the exact client/company names to display.
- [ ] Supply approved logo files and confirm the usage rights.
- [ ] Obtain written permission for each logo and company name.
- [ ] Approve categories/sectors or applications associated with each client.
- [ ] Approve any quote, testimonial, case study, result or performance claim before publication.
- [ ] Confirm whether the page should include enquiry/contact calls to action.
- [ ] Assign a Kleawip content owner to keep client relationships and permissions current.

Do not publish client names, logos, testimonials or results without written approval. The content administration already included in the original scope can manage this page; it does not add an admin view to the count.

## 11. Policies and operational decisions

### Customer identity

- [ ] Confirm email OTP, mobile OTP, password or approved combination.
- [ ] Confirm login requirement before checkout.
- [ ] Confirm duplicate-account and account-recovery rules.
- [ ] Confirm account deletion and data-export workflow.

### Payments and COD

- [ ] Confirm Razorpay merchant readiness and test access.
- [ ] Confirm accepted payment methods and capture behaviour.
- [ ] Confirm full and partial-refund approval rules.
- [ ] Confirm COD minimum/maximum value and COD fee.
- [ ] Confirm partial-COD advance formula.
- [ ] Confirm treatment of advance on cancellation, return and refusal.

### Shipping and fulfilment

- [ ] Confirm Shiprocket, DTDC or other approved provider.
- [ ] Confirm 1 kg rate card using representative pincodes.
- [ ] Confirm package dimensions and volumetric-weight divisor.
- [ ] Confirm courier selection, serviceability and delivery promise rules.
- [ ] Confirm AWB, label, manifest, pickup, NDR and RTO procedures.
- [ ] Obtain sample carrier label/invoice PDFs and confirm supported paper sizes (e.g. thermal 4×6, A6, A4), print scaling, QR/barcode fields and scan requirements with the selected provider.
- [ ] Confirm whether Amazon/Flipkart marketplace order and label integration is in scope; if yes, define which marketplace-issued documents must be imported/printed without alteration.
- [ ] Confirm reverse-pickup and damaged-shipment process.

### Returns, exchanges and support

- [ ] Confirm return window and excluded products.
- [ ] Confirm exchange eligibility and price-difference handling.
- [ ] Confirm warehouse QC outcomes and restocking rules.
- [ ] Confirm COD refund method and authorised approvers.
- [ ] Confirm support roles, ticket categories, priority and SLA.
- [ ] Confirm customer escalation owner.

### Promotions and retention

- [ ] Confirm coupon types and stacking rules.
- [ ] Confirm bundle, free-gift and prepaid-discount rules.
- [ ] Confirm back-in-stock and abandoned-cart communication.
- [ ] Confirm whether store credit and referrals launch now or later.

## 12. Access handling rules

- Never request or store the client's primary Google password.
- Never store passwords, recovery codes or API secrets in GitHub, Graphify, documents or chat history.
- Use platform invitations and role-based access wherever available.
- Use a password manager for credentials that cannot be delegated.
- Client recovery phone/email and billing payment method remain client-controlled.
- MarketiX access is reviewed at launch and reduced or removed according to the support agreement.
- Every production credential has an identified owner and rotation procedure.
- Lost-device, staff-exit and suspected-compromise procedures are documented before production.

## 13. Phase 0 account exit gate

The account and access portion of Phase 0 is complete only when:

- [ ] Client platform-owner identity exists and has 2FA.
- [ ] Recovery method is controlled and tested by the client.
- [ ] GitHub organisation and private repository are client-owned.
- [ ] Vercel team/project is client-owned and the collaboration plan is approved.
- [ ] Railway workspace/project is client-owned and roles are approved.
- [ ] Hostinger/domain ownership and recovery are confirmed.
- [ ] Billing responsibility is recorded for every provider.
- [ ] MarketiX has individual invited access without receiving the client's primary password.
- [ ] Preview/Staging and Production boundaries are documented.
- [ ] Secret-handling and access-removal procedures are approved.
- [ ] Bulk / Wholesale Enquiry rules and quote/order workflow are approved.
- [ ] Client showcase names, logo permissions and approved claims are recorded.

## 14. Official references

- Google Account with an alternate non-Gmail address: https://support.google.com/accounts/answer/176347
- GitHub organisation best practices: https://docs.github.com/en/organizations/collaborating-with-groups-in-organizations/best-practices-for-organizations
- GitHub organisation 2FA enforcement: https://docs.github.com/en/organizations/keeping-your-organization-secure/managing-two-factor-authentication-for-your-organization/requiring-two-factor-authentication-in-your-organization
- Vercel account and team management: https://vercel.com/docs/accounts
- Vercel team-member management: https://vercel.com/docs/rbac/managing-team-members
- Railway workspaces and roles: https://docs.railway.com/projects/workspaces
- Railway production security: https://docs.railway.com/guides/lock-down-production-project
- Railway 2FA enforcement: https://docs.railway.com/access/two-factor-enforcement

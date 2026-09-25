from pathlib import Path

from PIL import Image
from docx import Document
from docx.enum.section import WD_ORIENT
from docx.enum.table import WD_ALIGN_VERTICAL, WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Inches, Pt, RGBColor


ROOT = Path("/Users/mac15/Marketix/Kleawip/WEBSITE DATA/project")
OUT = ROOT / "deliverables/proposals/Kleawip_Feature_Expansion_Addendum.docx"
LOGO_WEBP = ROOT / "assets/brand/Kleawip-logo.webp"
LOGO_PNG = ROOT / "tmp/feature-expansion/Kleawip-logo.png"

BLUE = "087FBE"
DEEP_BLUE = "075B91"
PALE_BLUE = "EAF7FD"
PURPLE = "6D28D9"
PALE_PURPLE = "F6F0FF"
INK_HEX = "102A43"
MUTED_HEX = "62758A"
GRID = "D7E2EA"
PALE_ROW = "F7FAFC"
WHITE_HEX = "FFFFFF"

INK = RGBColor.from_string(INK_HEX)
MUTED = RGBColor.from_string(MUTED_HEX)
WHITE = RGBColor(255, 255, 255)


def set_repeat_header(row):
    tr_pr = row._tr.get_or_add_trPr()
    node = OxmlElement("w:tblHeader")
    node.set(qn("w:val"), "true")
    tr_pr.append(node)


def prevent_row_split(row):
    tr_pr = row._tr.get_or_add_trPr()
    tr_pr.append(OxmlElement("w:cantSplit"))


def set_cell_fill(cell, fill):
    tc_pr = cell._tc.get_or_add_tcPr()
    shd = tc_pr.find(qn("w:shd"))
    if shd is None:
        shd = OxmlElement("w:shd")
        tc_pr.append(shd)
    shd.set(qn("w:fill"), fill)


def set_cell_border(cell, color=GRID, size="5"):
    tc_pr = cell._tc.get_or_add_tcPr()
    borders = tc_pr.first_child_found_in("w:tcBorders")
    if borders is None:
        borders = OxmlElement("w:tcBorders")
        tc_pr.append(borders)
    for edge in ("top", "left", "bottom", "right", "insideH", "insideV"):
        el = borders.find(qn(f"w:{edge}"))
        if el is None:
            el = OxmlElement(f"w:{edge}")
            borders.append(el)
        el.set(qn("w:val"), "single")
        el.set(qn("w:sz"), size)
        el.set(qn("w:color"), color)


def set_cell_margins(cell, top=100, start=120, bottom=100, end=120):
    tc_pr = cell._tc.get_or_add_tcPr()
    tc_mar = tc_pr.first_child_found_in("w:tcMar")
    if tc_mar is None:
        tc_mar = OxmlElement("w:tcMar")
        tc_pr.append(tc_mar)
    for name, value in (("top", top), ("start", start), ("bottom", bottom), ("end", end)):
        node = tc_mar.find(qn(f"w:{name}"))
        if node is None:
            node = OxmlElement(f"w:{name}")
            tc_mar.append(node)
        node.set(qn("w:w"), str(value))
        node.set(qn("w:type"), "dxa")


def set_repeatable_font(run, size=9.5, bold=False, color=INK, name="Arial"):
    run.font.name = name
    run._element.get_or_add_rPr().rFonts.set(qn("w:ascii"), name)
    run._element.get_or_add_rPr().rFonts.set(qn("w:hAnsi"), name)
    run.font.size = Pt(size)
    run.bold = bold
    run.font.color.rgb = color


def add_page_number(paragraph):
    run = paragraph.add_run()
    fld_char = OxmlElement("w:fldChar")
    fld_char.set(qn("w:fldCharType"), "begin")
    instr = OxmlElement("w:instrText")
    instr.set(qn("xml:space"), "preserve")
    instr.text = " PAGE "
    fld_sep = OxmlElement("w:fldChar")
    fld_sep.set(qn("w:fldCharType"), "separate")
    text = OxmlElement("w:t")
    text.text = "1"
    fld_end = OxmlElement("w:fldChar")
    fld_end.set(qn("w:fldCharType"), "end")
    run._r.extend([fld_char, instr, fld_sep, text, fld_end])
    set_repeatable_font(run, size=7.5, bold=True, color=MUTED)


def add_header_footer(section):
    header = section.header
    hp = header.paragraphs[0]
    hp.alignment = WD_ALIGN_PARAGRAPH.LEFT
    hp.paragraph_format.space_after = Pt(0)
    r = hp.add_run("KLEAWIP ECOMMERCE PLATFORM")
    set_repeatable_font(r, size=7.5, bold=True, color=RGBColor.from_string(DEEP_BLUE))
    r = hp.add_run("    FEATURE EXPANSION ADDENDUM")
    set_repeatable_font(r, size=7.5, bold=True, color=MUTED)

    footer = section.footer
    fp = footer.paragraphs[0]
    fp.alignment = WD_ALIGN_PARAGRAPH.LEFT
    r = fp.add_run("MARKETIX STUDIO   |   marketixstudio.com")
    set_repeatable_font(r, size=7.5, bold=True, color=RGBColor.from_string(PURPLE))
    r = fp.add_run("                                                         CONFIDENTIAL   |   ")
    set_repeatable_font(r, size=7.5, bold=True, color=MUTED)
    add_page_number(fp)


def set_page_background(doc):
    background = OxmlElement("w:background")
    background.set(qn("w:color"), "FFFFFF")
    doc._element.insert(0, background)


def configure_document():
    doc = Document()
    section = doc.sections[0]
    section.orientation = WD_ORIENT.LANDSCAPE
    section.page_width = Cm(29.7)
    section.page_height = Cm(21.0)
    section.top_margin = Cm(1.35)
    section.bottom_margin = Cm(1.25)
    section.left_margin = Cm(1.45)
    section.right_margin = Cm(1.45)
    section.header_distance = Cm(0.55)
    section.footer_distance = Cm(0.55)
    add_header_footer(section)
    set_page_background(doc)

    for style_name in ("Normal", "Title", "Heading 1", "Heading 2", "Heading 3", "List Bullet"):
        style = doc.styles[style_name]
        style.font.name = "Arial"
        style._element.rPr.rFonts.set(qn("w:ascii"), "Arial")
        style._element.rPr.rFonts.set(qn("w:hAnsi"), "Arial")
        style.font.color.rgb = INK
    doc.styles["Normal"].font.size = Pt(9.5)
    doc.styles["Normal"].paragraph_format.space_after = Pt(5)
    doc.styles["Normal"].paragraph_format.line_spacing = 1.08
    return doc


def add_kicker(doc, text):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(1)
    p.paragraph_format.space_after = Pt(3)
    r = p.add_run(text.upper())
    set_repeatable_font(r, size=8.2, bold=True, color=RGBColor.from_string(DEEP_BLUE))


def add_heading(doc, text, level=1):
    p = doc.add_paragraph(style=f"Heading {level}")
    p.paragraph_format.keep_with_next = True
    p.paragraph_format.space_before = Pt(1 if level == 1 else 7)
    p.paragraph_format.space_after = Pt(5 if level == 1 else 3)
    size = 22 if level == 1 else 12
    r = p.add_run(text)
    set_repeatable_font(r, size=size, bold=True, color=INK)
    return p


def add_intro(doc, text):
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(10)
    p.paragraph_format.line_spacing = 1.08
    r = p.add_run(text)
    set_repeatable_font(r, size=10.6, color=MUTED)


def add_body(doc, text, bold_lead=None):
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(6)
    p.paragraph_format.line_spacing = 1.08
    if bold_lead:
        r = p.add_run(bold_lead)
        set_repeatable_font(r, size=9.5, bold=True)
    r = p.add_run(text)
    set_repeatable_font(r, size=9.5)
    return p


def add_bullets(doc, items, columns=1, size=9.1):
    if columns == 1:
        for item in items:
            p = doc.add_paragraph(style="List Bullet")
            p.paragraph_format.left_indent = Cm(0.55)
            p.paragraph_format.first_line_indent = Cm(-0.25)
            p.paragraph_format.space_after = Pt(3.2)
            p.paragraph_format.line_spacing = 1.04
            r = p.add_run(item)
            set_repeatable_font(r, size=size)
        return

    split = (len(items) + 1) // 2
    pairs = list(zip(items[:split], items[split:] + [""] * split))
    table = doc.add_table(rows=len(pairs), cols=2)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = False
    for row, pair in zip(table.rows, pairs):
        prevent_row_split(row)
        for cell, item in zip(row.cells, pair):
            cell.width = Cm(13.15)
            cell.vertical_alignment = WD_ALIGN_VERTICAL.TOP
            set_cell_margins(cell, top=25, start=70, bottom=25, end=140)
            set_cell_border(cell, color="FFFFFF", size="0")
            cell.text = ""
            if item:
                p = cell.paragraphs[0]
                p.paragraph_format.left_indent = Cm(0.35)
                p.paragraph_format.first_line_indent = Cm(-0.2)
                p.paragraph_format.space_after = Pt(2.5)
                p.paragraph_format.line_spacing = 1.02
                r = p.add_run("• ")
                set_repeatable_font(r, size=size, bold=True, color=RGBColor.from_string(BLUE))
                r = p.add_run(item)
                set_repeatable_font(r, size=size)


def add_table(doc, headers, rows, widths=None, font_size=8.3, header_fill=DEEP_BLUE):
    table = doc.add_table(rows=1, cols=len(headers))
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = False
    hdr = table.rows[0]
    set_repeat_header(hdr)
    prevent_row_split(hdr)
    for i, (cell, label) in enumerate(zip(hdr.cells, headers)):
        if widths:
            cell.width = Cm(widths[i])
        cell.vertical_alignment = WD_ALIGN_VERTICAL.CENTER
        set_cell_fill(cell, header_fill)
        set_cell_border(cell)
        set_cell_margins(cell, top=105, start=115, bottom=105, end=115)
        p = cell.paragraphs[0]
        p.paragraph_format.space_after = Pt(0)
        r = p.add_run(label)
        set_repeatable_font(r, size=font_size, bold=True, color=WHITE)
    for ri, values in enumerate(rows, 1):
        row = table.add_row()
        prevent_row_split(row)
        for ci, (cell, value) in enumerate(zip(row.cells, values)):
            if widths:
                cell.width = Cm(widths[ci])
            cell.vertical_alignment = WD_ALIGN_VERTICAL.CENTER
            set_cell_fill(cell, PALE_ROW if ri % 2 == 0 else WHITE_HEX)
            set_cell_border(cell)
            set_cell_margins(cell)
            p = cell.paragraphs[0]
            p.paragraph_format.space_after = Pt(0)
            p.paragraph_format.line_spacing = 1.02
            r = p.add_run(str(value))
            set_repeatable_font(r, size=font_size, bold=(ci == 0 and len(headers) <= 3))
    spacer = doc.add_paragraph()
    spacer.paragraph_format.space_after = Pt(1)
    return table


def add_metrics(doc, metrics, fill=PALE_BLUE):
    table = doc.add_table(rows=1, cols=len(metrics))
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = False
    for cell, (value, label) in zip(table.rows[0].cells, metrics):
        cell.width = Cm(26.6 / len(metrics))
        cell.vertical_alignment = WD_ALIGN_VERTICAL.CENTER
        set_cell_fill(cell, fill)
        set_cell_border(cell, color=BLUE, size="7")
        set_cell_margins(cell, top=170, start=100, bottom=160, end=100)
        cell.text = ""
        p = cell.paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p.paragraph_format.space_after = Pt(3)
        r = p.add_run(value)
        set_repeatable_font(r, size=21, bold=True, color=RGBColor.from_string(DEEP_BLUE))
        p = cell.add_paragraph()
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p.paragraph_format.space_after = Pt(0)
        r = p.add_run(label.upper())
        set_repeatable_font(r, size=7.7, bold=True, color=RGBColor.from_string(DEEP_BLUE))
    doc.add_paragraph().paragraph_format.space_after = Pt(2)


def new_page(doc, kicker, heading, intro):
    doc.add_page_break()
    add_kicker(doc, kicker)
    add_heading(doc, heading)
    add_intro(doc, intro)


def add_cover(doc):
    with Image.open(LOGO_WEBP) as im:
        im.convert("RGBA").save(LOGO_PNG)

    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(20)
    p.add_run().add_picture(str(LOGO_PNG), width=Inches(2.65))

    title = doc.add_paragraph(style="Title")
    title.paragraph_format.space_after = Pt(7)
    r = title.add_run("Kleawip Feature Expansion Addendum")
    set_repeatable_font(r, size=30, bold=True, color=INK)

    subtitle = doc.add_paragraph()
    subtitle.paragraph_format.space_after = Pt(17)
    r = subtitle.add_run("Customer service, after sales, delivery control, product discovery and retention capabilities")
    set_repeatable_font(r, size=13.2, bold=True, color=RGBColor.from_string(DEEP_BLUE))

    add_metrics(
        doc,
        [
            ("82", "Customer pages and screens"),
            ("73+", "Administration views"),
            ("155+", "Combined platform views"),
            ("10", "Launch products unchanged"),
        ],
    )

    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(8)
    p.paragraph_format.space_after = Pt(3)
    r = p.add_run("Prepared and presented by MarketiX Studio")
    set_repeatable_font(r, size=10.5, bold=True, color=RGBColor.from_string(PURPLE))
    p = doc.add_paragraph()
    r = p.add_run("marketixstudio.com  |  contact@marketixstudio.com  |  +91 90217 53876")
    set_repeatable_font(r, size=9.2, color=MUTED)
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(7)
    r = p.add_run("Supplement to the Kleawip Ecommerce Platform Scope of Work  |  Client discussion version  |  Confidential")
    set_repeatable_font(r, size=8.5, bold=True, color=MUTED)


def build():
    OUT.parent.mkdir(parents=True, exist_ok=True)
    LOGO_PNG.parent.mkdir(parents=True, exist_ok=True)
    doc = configure_document()
    add_cover(doc)

    new_page(
        doc,
        "01  Addendum purpose",
        "New capabilities beyond the original ecommerce baseline",
        "This addendum expands selected operational and customer-experience areas identified after the original scope was shared. It does not replace, reduce or re-price the original proposal, and it does not repeat baseline functionality as a new deliverable.",
    )
    add_table(
        doc,
        ["Baseline area", "Original scope", "Expansion introduced by this addendum"],
        [
            ["Customer support", "Support-ticket destination and support role", "End-to-end service desk with ownership, SLA, conversations, escalation and analytics"],
            ["Returns and refunds", "Request, approval, pickup, inspection and refund/replacement", "Policy engine, item-level cases, exchanges, COD refunds, store credit, approval levels and exception control"],
            ["Shipping exceptions", "NDR status, tracking, COD and RTO reporting", "Dedicated NDR/RTO control centre with action queues, risk rules and customer response workflows"],
            ["Reviews and discovery", "Reviews, search and product filters in the shopping journey", "Verified-buyer moderation, Q&A, search merchandising, comparison and guided GSM selection"],
            ["Retention", "Reorder, customer cohorts and consent-aware reminders", "Back-in-stock, store credit, referral tools and configurable lifecycle operations"],
            ["Governance", "Roles, audit history, backups and provider integrations", "Central exception queues, high-risk approvals, privacy requests and session controls"],
        ],
        widths=[4.3, 9.3, 13.0],
        font_size=8.0,
    )
    add_body(doc, "The client may approve the full addendum or select modules for phased delivery. Final milestones will follow the approved module list and acceptance criteria.", bold_lead="Approval model. ")

    new_page(
        doc,
        "02  Expanded scope",
        "Updated platform size and operational depth",
        "The addendum introduces fifteen customer-facing destinations and twenty-nine administration views. Counts represent major destinations and workflows; modals, tabs, empty states, loading states, errors, permissions and responsive/theme variants are not falsely counted as separate pages.",
    )
    add_metrics(
        doc,
        [
            ("67 to 82", "Customer screens"),
            ("44+ to 73+", "Administration views"),
            ("111+ to 155+", "Combined platform views"),
            ("25 to 34", "Approximate layout families"),
        ],
        fill=PALE_PURPLE,
    )
    add_table(
        doc,
        ["Expansion group", "Customer additions", "Admin additions", "Primary operational outcome"],
        [
            ["Support and after sales", "7", "13", "Structured ticket, return, exchange, refund and service workflows"],
            ["Delivery exceptions", "0", "4", "NDR action, RTO control and delivery-risk visibility"],
            ["Trust and discovery", "3", "7", "Reviews, Q&A, comparison, search controls and guided selection"],
            ["Retention and communication", "3", "2", "Subscriptions, store credit, referrals and notification control"],
            ["Privacy and reliability", "1", "3", "Customer requests, exception handling and session security"],
            ["Total additions", "15", "29", "44 additional destinations and views"],
        ],
        widths=[5.0, 3.7, 3.7, 14.2],
        font_size=8.2,
    )

    new_page(
        doc,
        "03  Customer service",
        "A complete support desk connected to every order",
        "The existing support-ticket concept is expanded into a controlled service operation. Customers receive a clear case history, while Kleawip staff receive ownership, prioritisation and measurable response workflows.",
    )
    add_table(
        doc,
        ["Customer experience", "Support administration"],
        [[
            "Support centre with guided issue categories\nMy Tickets list and searchable history\nNew ticket linked to an order, payment, shipment, return or product\nThreaded replies and validated attachments\nVisible status, ticket number, assigned team and last update\nReopen rules and post-resolution satisfaction rating",
            "Unified ticket queue with priority, filters and ageing\nAgent/team assignment with ownership history\nNew, Open, Waiting, Resolved and Closed workflow\nFirst-response and resolution SLA timers\nInternal notes, reply templates and escalation rules\nWorkload, response-time, resolution-time and satisfaction reports",
        ]],
        widths=[13.3, 13.3],
        font_size=8.7,
    )
    add_heading(doc, "AI assisted support with human control", level=2)
    add_bullets(doc, [
        "Summarise long ticket threads and highlight the latest unresolved issue.",
        "Suggest category, priority and an editable reply using approved Kleawip knowledge and current case facts.",
        "Keep private customer and order data access permission-based and logged.",
        "Require an authorised staff member to approve every refund, cancellation, replacement or account change.",
    ], columns=2, size=8.8)

    new_page(
        doc,
        "04  After sales",
        "Advanced returns, exchanges and refund operations",
        "The original return workflow is extended into an item-level after-sales system with policy checks, warehouse inspection, financial control and customer-visible progress.",
    )
    add_bullets(doc, [
        "Eligibility rules by product, category, delivery date, reason, condition and return window.",
        "Item-level return, replacement, exchange, partial-refund or service resolution.",
        "RMA reference, evidence upload, reason codes and complete case timeline.",
        "Reverse-pickup booking, AWB, tracking and pickup-exception handling.",
        "Warehouse QC outcome: unopened, sellable, damaged, wrong item or customer-damaged.",
        "Stock disposition: restock, quarantine, damaged stock or write-off with audit history.",
        "Full and partial online refunds with gateway status and reconciliation.",
        "Controlled COD refund details collection with maker-checker approval.",
        "Exchange price difference collection or refund where the selected policy permits it.",
        "Optional store-credit or coupon compensation with an immutable transaction record.",
        "Customer notifications for request, approval, pickup, inspection, replacement and refund status.",
        "Return rate, reason, ageing, refund delay and product-quality reporting.",
    ], columns=2, size=8.9)
    add_body(doc, "Refunds must not be marked complete only because a request was submitted. The platform records initiation, provider acknowledgement, final processing and any discrepancy as separate states.", bold_lead="Financial control. ")

    new_page(
        doc,
        "05  Delivery operations",
        "NDR and RTO control centre",
        "Failed delivery attempts create direct cost and customer frustration. The expansion adds an operations queue that turns courier exceptions into traceable actions instead of leaving them inside provider dashboards or spreadsheets.",
    )
    add_table(
        doc,
        ["Workflow", "Expanded capability", "Operational value"],
        [
            ["NDR intake", "Import failed-attempt reason, courier status, next action and response deadline", "One actionable queue across shipments"],
            ["Customer confirmation", "Secure link to confirm address, preferred date, reattempt or cancellation where supported", "Faster resolution with less manual messaging"],
            ["Operations follow-up", "Assign owner, record call/note, schedule action and escalate ageing cases", "Clear responsibility and history"],
            ["RTO risk rules", "Apply controls using pincode, order value, customer history and prior RTO behaviour", "Prepaid or partial-COD protection where justified"],
            ["Reconciliation", "Track forward freight, return freight, advance collected, COD due and provider remittance", "True cost visibility per failed order"],
            ["Reporting", "NDR recovery, RTO reason, pincode, carrier, customer and product analysis", "Better courier and COD decisions"],
        ],
        widths=[4.2, 13.5, 8.9],
        font_size=8.15,
    )
    add_body(doc, "Automated customer actions depend on the selected shipping provider's API and account capabilities. Where an action is unavailable, the case remains visible for manual resolution.", bold_lead="Provider dependency. ")

    new_page(
        doc,
        "06  Trust content",
        "Verified reviews and product questions",
        "Kleawip can collect useful post-purchase feedback while maintaining moderation, evidence and brand safety. Reviews and answers remain linked to the correct base product and purchasable variant.",
    )
    add_table(
        doc,
        ["Capability", "Customer-facing behaviour", "Administration control"],
        [
            ["Verified reviews", "Rating and review submission after a delivered order", "Verified-purchase flag and order linkage"],
            ["Review media", "Optional image and video evidence", "File validation, moderation and removal history"],
            ["Merchant response", "Visible Kleawip reply below an approved review", "Authorised response and edit history"],
            ["Product Q&A", "Customer asks a product or usage question", "Moderation, assignment, answer and publishing status"],
            ["Review invitation", "Consent-aware request after delivery", "Schedule, template and suppression rules"],
            ["Abuse control", "Report inappropriate content", "Spam signals, blocked terms and auditable decision"],
            ["Reporting", "Helpful-review and rating visibility", "Rating trends, response time and product issue patterns"],
        ],
        widths=[4.5, 10.8, 11.3],
        font_size=8.15,
    )
    add_body(doc, "Only genuine approved feedback may contribute to the displayed rating. No fabricated testimonials, imported ratings without source rights or misleading aggregate scores are included.", bold_lead="Trust requirement. ")

    new_page(
        doc,
        "07  Product discovery",
        "Advanced search, comparison and guided GSM selection",
        "The expansion helps shoppers translate an intended use into the correct towel, GSM, size and variant while giving the client control over search quality and merchandising.",
    )
    add_table(
        doc,
        ["Capability", "Experience", "Client control"],
        [
            ["Search language", "Typo tolerance, normalization and synonyms such as cloth, towel, car and automotive", "Manage approved synonyms and blocked terms"],
            ["Suggestions", "Products, categories, applications, GSM, size and helpful content", "Priorities and seasonal suggestions"],
            ["Merchandising", "Relevant promoted items without hiding better matches", "Rules by query, category, stock and campaign period"],
            ["Zero-result recovery", "Alternative terms, nearby categories and popular products", "Review top zero-result queries"],
            ["Product comparison", "Side-by-side GSM, size, weave, edge, application, absorbency and care", "Select comparable attributes and eligible products"],
            ["GSM finder", "Guided questions for use, surface, drying need and preferred size", "Manage rules, explanations and recommended products"],
            ["Search analytics", "No personal information shown", "Queries, result clicks, zero results and search-to-purchase insight"],
        ],
        widths=[4.4, 11.4, 10.8],
        font_size=8.0,
    )

    new_page(
        doc,
        "08  Customer retention",
        "Useful reasons for customers to return",
        "Retention tools are designed around service and relevance. Each automated communication respects the customer's channel preferences and the client's approved communication rules.",
    )
    add_table(
        doc,
        ["Feature", "Customer value", "Control and safeguards"],
        [
            ["Back in stock", "Subscribe to a specific unavailable variant", "One alert per restock cycle, unsubscribe and delivery logs"],
            ["Price drop", "Optional alert for a saved product", "Campaign eligibility, consent and suppression rules"],
            ["Abandoned cart", "Return to a saved cart from a secure link", "Delay, frequency cap, exclusions and consent"],
            ["Quick reorder", "Rebuild a cart from a past order", "Current stock, price and eligibility are revalidated"],
            ["Store credit", "Receive and use an approved account balance", "Immutable ledger, expiry, adjustment reason and staff permissions"],
            ["Referral centre", "Share a personal referral and view eligible rewards", "Fraud limits, qualifying order rules and reversal controls"],
            ["Segments", "More relevant offers and communication", "First-time, repeat, inactive, category-interest, COD-heavy and high-value rules"],
        ],
        widths=[4.3, 10.7, 11.6],
        font_size=8.05,
    )
    add_body(doc, "Store credit and referral rewards are new optional commercial systems. Their earning, expiry, cancellation and tax treatment must be approved before development.", bold_lead="Policy dependency. ")

    new_page(
        doc,
        "09  Communications",
        "Notification templates, delivery logs and controlled replay",
        "The baseline already includes lifecycle notifications. This expansion gives authorised staff visibility and controlled administration when a message is delayed, fails or must be corrected.",
    )
    add_bullets(doc, [
        "Editable templates for approved transactional events with safe variable placeholders.",
        "Template versions, approval status and rollback to a previous approved version.",
        "Preview using non-sensitive test data before publication.",
        "Delivery logs by order, customer, channel, event and provider status.",
        "Automatic retry for temporary failures with duplicate-send protection.",
        "Authorised manual replay with reason and audit history.",
        "Operations alerts for failed OTP, payment, refund, shipment and support messages.",
        "Customer preference centre and channel-level unsubscribe handling where applicable.",
        "Strict separation between transactional and promotional communication.",
        "SMS and WhatsApp activation remains dependent on client-approved providers, templates and usage charges.",
    ], columns=2, size=9.0)
    add_heading(doc, "Lifecycle coverage", level=2)
    add_body(doc, "Identity, payment, order, packing, shipping, delivery, NDR, return, exchange, refund, ticket update, back-in-stock and consented retention messages can be governed through the same operations model.")

    new_page(
        doc,
        "10  Reliability",
        "Exception queues and high risk approvals",
        "Normal orders should flow automatically. Failed or uncertain operations must become visible cases with a safe next action, ownership and a permanent history.",
    )
    add_table(
        doc,
        ["Exception area", "Required controls", "Resolution evidence"],
        [
            ["Payment", "Late success, duplicate callback, signature failure and amount mismatch", "Gateway reference, verification result and order decision"],
            ["Refund", "Initiated, pending, failed, processed and reconciliation mismatch", "Refund reference, webhook/API status and approval history"],
            ["Shipping", "Serviceability, AWB, pickup, tracking and cancellation failure", "Provider response, retry count and manual resolution"],
            ["Notification", "Rejected, bounced, delayed or provider unavailable", "Template version, provider status and replay record"],
            ["Inventory", "Reservation expiry, negative-stock prevention and adjustment conflict", "Ledger movement, operator and resulting balance"],
            ["High-risk action", "Manual refund, store-credit issue, stock write-off and bulk reward", "Maker-checker approval and audit entry"],
        ],
        widths=[4.1, 13.3, 9.2],
        font_size=8.2,
    )
    add_body(doc, "Provider calls use idempotency and bounded retry behaviour where the provider supports it. Staff should never need to guess whether an order, shipment or refund was created twice.", bold_lead="Reliability principle. ")

    new_page(
        doc,
        "11  Privacy and access",
        "Customer data requests and stronger session control",
        "The expansion adds practical workflows for handling customer information and staff access without weakening the role-based controls already planned for the platform.",
    )
    add_table(
        doc,
        ["Area", "Customer or staff experience", "Administration safeguard"],
        [
            ["Privacy requests", "Request account-data export or deletion review", "Identity verification, case status, retention checks and approval history"],
            ["Account sessions", "View and revoke active sessions where enabled", "Device/session history and forced sign-out"],
            ["Suspicious access", "Security notification after defined risk events", "Rate limits, lockout and staff investigation trail"],
            ["Attachments", "Upload only allowed formats and sizes", "Access control, validation, retention and removal history"],
            ["Sensitive actions", "Clear confirmation and outcome", "Re-authentication, least privilege and maker-checker approval"],
            ["Exports", "No direct unrestricted export access", "Role limitation, reason capture and auditable download"],
            ["Retention", "Published policy controls expectations", "Configurable retention schedule and authorised deletion workflow"],
        ],
        widths=[4.3, 10.9, 11.4],
        font_size=8.1,
    )
    add_body(doc, "Final privacy, retention, refund and communication policies must be supplied or approved by the client and its advisers. MarketiX Studio implements the approved workflow but does not provide legal advice.", bold_lead="Client responsibility. ")

    new_page(
        doc,
        "12  Customer page inventory",
        "Fifteen additional customer destinations",
        "These destinations are added to the original sixty-seven customer-facing pages and screens, producing a revised customer count of eighty-two.",
    )
    customer_pages = [
        ["68", "Support Centre", "Guided self-service categories and support entry point"],
        ["69", "My Tickets", "Ticket list, filters and current status"],
        ["70", "Ticket Conversation", "Thread, attachments, order link and resolution history"],
        ["71", "Return and Exchange Eligibility", "Policy and item-level eligibility result"],
        ["72", "Return or Refund Case Detail", "RMA timeline, pickup, QC and resolution"],
        ["73", "Exchange Selection", "Eligible replacement variant and price difference"],
        ["74", "COD Refund Details", "Verified refund destination submission and status"],
        ["75", "Product Comparison", "Comparable product and variant attributes"],
        ["76", "GSM and Use Case Finder", "Guided recommendation workflow"],
        ["77", "Product Questions and Answers", "Product-specific questions and approved answers"],
        ["78", "Back in Stock Subscriptions", "Variant subscriptions and alert management"],
        ["79", "Store Credit", "Available balance and transaction history"],
        ["80", "Referral Centre", "Referral link, eligibility and reward history"],
        ["81", "Privacy Requests", "Account export or deletion-review request"],
        ["82", "Clients We Work With", "Approved client brands, sectors and references"],
    ]
    add_table(doc, ["New number", "Destination", "Purpose"], customer_pages, widths=[2.5, 8.3, 15.8], font_size=7.65)

    new_page(
        doc,
        "13  Administration inventory",
        "Twenty-nine additional administration views",
        "The first fifteen additions establish service, after-sales and delivery-exception operations. These extend the original forty-four-plus administration views.",
    )
    admin_1 = [
        ["45", "Service Desk Dashboard", "Open volume, SLA, ageing and ownership"],
        ["46", "Ticket Queue", "Search, filters, priority and assignment"],
        ["47", "Ticket Detail", "Conversation, internal notes and linked records"],
        ["48", "SLA and Escalation Rules", "Response targets and overdue routing"],
        ["49", "Reply Templates", "Approved macros and versioning"],
        ["50", "Support Analytics", "Response, resolution, reopen and satisfaction"],
        ["51", "Return Rules", "Eligibility and resolution policies"],
        ["52", "After Sales Queue", "Return, exchange, refund and replacement workload"],
        ["53", "Return Case and QC", "Evidence, pickup, inspection and disposition"],
        ["54", "Exchange Processing", "Replacement variant and price difference"],
        ["55", "Refund Approval", "Approval level and online refund control"],
        ["56", "COD Refund Workflow", "Refund destination, maker-checker and status"],
        ["57", "Store Credit Ledger", "Issue, redeem, expire, reverse and audit"],
        ["58", "NDR Queue", "Failed delivery cases and deadlines"],
        ["59", "NDR Case", "Customer response and courier action history"],
    ]
    add_table(doc, ["New number", "Administration view", "Purpose"], admin_1, widths=[2.5, 8.5, 15.6], font_size=7.55)

    new_page(
        doc,
        "14  Administration inventory",
        "Delivery, trust, discovery and governance views",
        "The remaining fourteen administration additions complete the revised inventory of seventy-three-plus major views. The additional Clients We Work With destination uses the existing content administration.",
    )
    admin_2 = [
        ["60", "RTO Risk Rules", "Pincode, order, customer and payment controls"],
        ["61", "RTO Analytics", "Cost, reason, carrier and recovery reporting"],
        ["62", "Review Moderation", "Verified status, media, decision and reply"],
        ["63", "Question and Answer Moderation", "Assignment, answer and publishing"],
        ["64", "Search Synonyms", "Approved query language and normalization"],
        ["65", "Search Merchandising", "Query, category and campaign result rules"],
        ["66", "Search Analytics", "Queries, zero results, clicks and conversion"],
        ["67", "Comparison Configuration", "Comparable fields and products"],
        ["68", "GSM Finder Rules", "Questions, decision rules and recommendations"],
        ["69", "Notification Templates", "Versions, previews and approval state"],
        ["70", "Notification Delivery Logs", "Provider outcome, retries and replay"],
        ["71", "Operations Exception Queue", "Payment, refund, shipment and job failures"],
        ["72", "Privacy Requests", "Verification, retention checks and resolution"],
        ["73", "Session and Device Security", "Active sessions, revocation and risk events"],
    ]
    add_table(doc, ["New number", "Administration view", "Purpose"], admin_2, widths=[2.5, 8.5, 15.6], font_size=7.55)

    new_page(
        doc,
        "15  Delivery and testing",
        "Every expansion module is accepted before the next one begins",
        "The addendum follows the same gated implementation principle as the main platform. A module is specified, designed, built, tested and approved before dependent work proceeds.",
    )
    add_table(
        doc,
        ["Gate", "Required output", "Acceptance evidence"],
        [
            ["1  Rules and states", "Approved workflow, roles, notifications, exceptions and policy dependencies", "Written acceptance criteria and state diagram"],
            ["2  UX approval", "Desktop/mobile flows, empty/error/loading states and both themes", "Client-approved screens and interaction notes"],
            ["3  Controlled build", "Customer, admin, service and data workflow", "Developer checks and traceable issue list"],
            ["4  Integration testing", "Sandbox payment, shipping and communication behaviour", "Success, failure, retry and duplicate-event tests"],
            ["5  Operational testing", "Agent, warehouse, finance and manager scenarios", "Role-specific test evidence and corrected defects"],
            ["6  Client acceptance", "Complete agreed module in staging", "Client sign-off before dependent module or production"],
            ["7  Launch verification", "Production configuration and controlled smoke test", "Health checks, sample workflow and rollback readiness"],
        ],
        widths=[4.2, 11.6, 10.8],
        font_size=8.15,
    )
    add_heading(doc, "Minimum scenario coverage", level=2)
    add_body(doc, "Happy path, validation error, permission denial, provider timeout, duplicate webhook, customer retry, partial completion, cancellation, notification failure, mobile layout, light mode, dark mode and audit-history verification.")

    new_page(
        doc,
        "16  Scope separation",
        "Search, analytics and AI visibility remain a separate service",
        "This addendum covers product functionality and operations. It does not include account setup, research, content production or ongoing optimization for search and measurement platforms.",
    )
    add_table(
        doc,
        ["Included in this feature addendum", "Reserved for a separate proposal"],
        [[
            "Support and case-management software\nAdvanced after-sales and refund workflows\nNDR/RTO operations\nReviews, Q&A, search and product-guidance features\nRetention, notification-control and exception features\nRequired application events and integration points where part of a selected module",
            "Google Analytics 4 property and reporting setup\nGoogle Tag Manager implementation governance\nGoogle Search Console verification and monitoring\nGoogle Merchant Center onboarding and feed operations\nSEO research, content strategy and ongoing optimization\nAEO/GEO strategy and AI-visibility monitoring\nContent writing, publishing calendar and monthly performance reporting",
        ]],
        widths=[13.3, 13.3],
        font_size=8.8,
    )
    add_heading(doc, "Also excluded unless separately approved", level=2)
    add_body(doc, "Customer-support staffing, legal drafting, product photography/video, marketplace synchronisation, ERP/accounting integration, native mobile apps, multi-warehouse allocation, third-party licences, SMS/WhatsApp usage, gateway charges and courier charges.")

    new_page(
        doc,
        "17  Addendum deliverables",
        "What Kleawip receives after approval",
        "The exact delivery set follows the modules selected by Kleawip and becomes part of the controlled implementation plan for the ecommerce platform.",
    )
    add_bullets(doc, [
        "Approved workflow and acceptance criteria for every selected module.",
        "Responsive customer experiences in the established Kleawip light and dark modes.",
        "Role-based administration views with audit history for critical actions.",
        "Connected order, customer, payment, shipment, return and support records.",
        "Provider-aware retries, failure states and operations exception handling.",
        "Transactional notifications and delivery visibility for selected workflows.",
        "Module-wise functional, responsive, permission and integration testing.",
        "Updated administration guide and client handover for the added operations.",
    ], columns=2, size=9.1)
    add_heading(doc, "Client decisions required", level=2)
    add_table(
        doc,
        ["Decision", "Confirmation required"],
        [
            ["Module selection", "Approve all additions or identify launch and later phases"],
            ["Support operations", "Roles, response targets, channels and escalation ownership"],
            ["After sales", "Return windows, exchange rules, COD refund method and store-credit policy"],
            ["Delivery risk", "NDR action rules, RTO thresholds and partial-COD restrictions"],
            ["Retention", "Back-in-stock, abandoned-cart, store-credit and referral choices"],
            ["Approvals", "Authorised staff for refunds, write-offs, exports and sensitive actions"],
        ],
        widths=[6.1, 20.5],
        font_size=8.2,
    )
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(3)
    p.alignment = WD_ALIGN_PARAGRAPH.LEFT
    r = p.add_run("MARKETIX STUDIO")
    set_repeatable_font(r, size=9.5, bold=True, color=RGBColor.from_string(PURPLE))
    r = p.add_run("   marketixstudio.com  |  contact@marketixstudio.com  |  +91 90217 53876")
    set_repeatable_font(r, size=9.0, color=MUTED)

    core = doc.core_properties
    core.title = "Kleawip Feature Expansion Addendum"
    core.subject = "Additional ecommerce platform capabilities beyond the original scope"
    core.author = "MarketiX Studio"
    core.keywords = "Kleawip, ecommerce, feature expansion, support desk, refunds, NDR, RTO"
    doc.save(OUT)
    print(OUT)


if __name__ == "__main__":
    build()

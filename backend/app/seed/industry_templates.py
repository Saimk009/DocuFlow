"""Seed the platform-wide ``industry_templates`` reference table.

These are the prebuilt, ready-to-publish IDP setups offered during onboarding.
Each template ships a full extraction schema per document type plus a complete,
publishable workflow definition (Capture -> Classify -> Extract -> Validate ->
Integrate). The whole point is to get a brand-new tenant from signup to a live,
working pipeline in minutes — no specialists, no multi-week deployment.

Run (idempotent):

    python -m app.seed.industry_templates
"""
from __future__ import annotations

import asyncio
from typing import Any

from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.models.template import IndustryTemplate

# ── Common validation patterns ──────────────────────────────────────────────
DATE_RE = r"^\d{4}-\d{2}-\d{2}$|^\d{1,2}/\d{1,2}/\d{2,4}$"
CURRENCY_RE = r"^\$?\s?\d{1,3}(,\d{3})*(\.\d{1,2})?$"
NUMBER_RE = r"^\d+(\.\d+)?$"
SSN_RE = r"^\d{3}-?\d{2}-?\d{4}$"
ROUTING_RE = r"^\d{9}$"
EMAIL_RE = r"^[^@\s]+@[^@\s]+\.[^@\s]+$"

# Validation threshold (%) applied at the Validate stage of every template.
VALIDATION_THRESHOLD = 85


def field(
    key: str,
    label: str,
    expected_format: str,
    validation_regex: str | None = None,
) -> dict[str, Any]:
    return {
        "key": key,
        "label": label,
        "expected_format": expected_format,
        "validation_regex": validation_regex,
    }


def workflow(name: str, doc_types: list[str]) -> dict[str, Any]:
    """A complete, ready-to-publish 5-stage pipeline definition."""
    stages = [
        ("n1", "capture", "Capture", {}),
        ("n2", "classify", "Classify", {"doc_types": doc_types}),
        ("n3", "extract", "Extract", {}),
        ("n4", "validate", "Validate", {"threshold": VALIDATION_THRESHOLD}),
        ("n5", "integrate", "Integrate", {}),
    ]
    nodes = [
        {
            "id": node_id,
            "type": node_type,
            "position": {"x": idx * 220, "y": 80},
            "data": {"label": label, **data},
        }
        for idx, (node_id, node_type, label, data) in enumerate(stages)
    ]
    edges = [
        {"id": f"e{i}", "source": stages[i][0], "target": stages[i + 1][0]}
        for i in range(len(stages) - 1)
    ]
    return {"name": name, "nodes": nodes, "edges": edges}


# ── Template definitions ─────────────────────────────────────────────────────
TEMPLATES: list[dict[str, Any]] = [
    {
        "key": "invoice_ap",
        "name": "Accounts Payable",
        "description": "Automate vendor invoice capture, coding, and approval routing.",
        "icon": "Receipt",
        "doc_types": ["Invoice", "Purchase Order", "Receipt"],
        "default_fields": {
            "Invoice": [
                field("vendor_name", "Vendor Name", "text"),
                field("invoice_number", "Invoice Number", "text"),
                field("invoice_date", "Invoice Date", "date", DATE_RE),
                field("due_date", "Due Date", "date", DATE_RE),
                field("po_number", "PO Number", "text"),
                field("subtotal", "Subtotal", "currency", CURRENCY_RE),
                field("tax_amount", "Tax Amount", "currency", CURRENCY_RE),
                field("total_amount", "Total Amount", "currency", CURRENCY_RE),
            ],
            "Purchase Order": [
                field("po_number", "PO Number", "text"),
                field("vendor_name", "Vendor Name", "text"),
                field("order_date", "Order Date", "date", DATE_RE),
                field("total_amount", "Total Amount", "currency", CURRENCY_RE),
            ],
            "Receipt": [
                field("merchant_name", "Merchant Name", "text"),
                field("transaction_date", "Transaction Date", "date", DATE_RE),
                field("total_amount", "Total Amount", "currency", CURRENCY_RE),
            ],
        },
    },
    {
        "key": "insurance_claims",
        "name": "Insurance Claims",
        "description": "Intake and triage claims, policies, and supporting medical bills.",
        "icon": "ShieldCheck",
        "doc_types": ["Claim Form", "Policy Document", "Medical Bill"],
        "default_fields": {
            "Claim Form": [
                field("claimant_name", "Claimant Name", "text"),
                field("policy_number", "Policy Number", "text"),
                field("claim_number", "Claim Number", "text"),
                field("date_of_loss", "Date of Loss", "date", DATE_RE),
                field("claim_amount", "Claim Amount", "currency", CURRENCY_RE),
                field("incident_description", "Incident Description", "text"),
            ],
            "Policy Document": [
                field("policy_number", "Policy Number", "text"),
                field("policyholder_name", "Policyholder Name", "text"),
                field("effective_date", "Effective Date", "date", DATE_RE),
                field("expiration_date", "Expiration Date", "date", DATE_RE),
                field("coverage_amount", "Coverage Amount", "currency", CURRENCY_RE),
            ],
            "Medical Bill": [
                field("provider_name", "Provider Name", "text"),
                field("patient_name", "Patient Name", "text"),
                field("service_date", "Service Date", "date", DATE_RE),
                field("billed_amount", "Billed Amount", "currency", CURRENCY_RE),
                field("procedure_code", "Procedure Code", "text"),
            ],
        },
    },
    {
        "key": "hr_onboarding",
        "name": "HR Onboarding",
        "description": "Process new-hire paperwork, tax forms, and identity documents.",
        "icon": "Users",
        "doc_types": ["Offer Letter", "Tax Form (W-4)", "ID Document", "Direct Deposit Form"],
        "default_fields": {
            "Offer Letter": [
                field("employee_name", "Employee Name", "text"),
                field("job_title", "Job Title", "text"),
                field("start_date", "Start Date", "date", DATE_RE),
                field("annual_salary", "Annual Salary", "currency", CURRENCY_RE),
                field("department", "Department", "text"),
            ],
            "Tax Form (W-4)": [
                field("employee_name", "Employee Name", "text"),
                field("ssn", "SSN", "ssn", SSN_RE),
                field("filing_status", "Filing Status", "text"),
                field("allowances", "Allowances", "number", NUMBER_RE),
            ],
            "ID Document": [
                field("full_name", "Full Name", "text"),
                field("id_number", "ID Number", "text"),
                field("date_of_birth", "Date of Birth", "date", DATE_RE),
                field("expiration_date", "Expiration Date", "date", DATE_RE),
            ],
            "Direct Deposit Form": [
                field("account_holder", "Account Holder", "text"),
                field("bank_name", "Bank Name", "text"),
                field("routing_number", "Routing Number", "number", ROUTING_RE),
                field("account_number", "Account Number", "text"),
            ],
        },
    },
    {
        "key": "loan_processing",
        "name": "Loan Processing",
        "description": "Verify applications and income documents to speed underwriting.",
        "icon": "Landmark",
        "doc_types": ["Loan Application", "Pay Stub", "Bank Statement", "Tax Return"],
        "default_fields": {
            "Loan Application": [
                field("applicant_name", "Applicant Name", "text"),
                field("loan_amount", "Loan Amount", "currency", CURRENCY_RE),
                field("loan_purpose", "Loan Purpose", "text"),
                field("annual_income", "Annual Income", "currency", CURRENCY_RE),
                field("ssn", "SSN", "ssn", SSN_RE),
            ],
            "Pay Stub": [
                field("employee_name", "Employee Name", "text"),
                field("employer_name", "Employer Name", "text"),
                field("pay_period", "Pay Period", "text"),
                field("gross_pay", "Gross Pay", "currency", CURRENCY_RE),
                field("net_pay", "Net Pay", "currency", CURRENCY_RE),
            ],
            "Bank Statement": [
                field("account_holder", "Account Holder", "text"),
                field("account_number", "Account Number", "text"),
                field("statement_period", "Statement Period", "text"),
                field("ending_balance", "Ending Balance", "currency", CURRENCY_RE),
            ],
            "Tax Return": [
                field("taxpayer_name", "Taxpayer Name", "text"),
                field("tax_year", "Tax Year", "number", NUMBER_RE),
                field("adjusted_gross_income", "Adjusted Gross Income", "currency", CURRENCY_RE),
                field("total_tax", "Total Tax", "currency", CURRENCY_RE),
            ],
        },
    },
    {
        "key": "healthcare_intake",
        "name": "Healthcare Intake",
        "description": "Digitize patient intake, insurance cards, referrals, and lab results.",
        "icon": "HeartPulse",
        "doc_types": ["Patient Intake Form", "Insurance Card", "Referral Letter", "Lab Result"],
        "default_fields": {
            "Patient Intake Form": [
                field("patient_name", "Patient Name", "text"),
                field("date_of_birth", "Date of Birth", "date", DATE_RE),
                field("phone_number", "Phone Number", "text"),
                field("insurance_provider", "Insurance Provider", "text"),
                field("chief_complaint", "Chief Complaint", "text"),
            ],
            "Insurance Card": [
                field("member_name", "Member Name", "text"),
                field("member_id", "Member ID", "text"),
                field("group_number", "Group Number", "text"),
                field("payer_name", "Payer Name", "text"),
            ],
            "Referral Letter": [
                field("patient_name", "Patient Name", "text"),
                field("referring_physician", "Referring Physician", "text"),
                field("specialist_name", "Specialist Name", "text"),
                field("reason_for_referral", "Reason for Referral", "text"),
            ],
            "Lab Result": [
                field("patient_name", "Patient Name", "text"),
                field("test_name", "Test Name", "text"),
                field("result_value", "Result Value", "text"),
                field("reference_range", "Reference Range", "text"),
                field("collection_date", "Collection Date", "date", DATE_RE),
            ],
        },
    },
    {
        "key": "logistics_bol",
        "name": "Logistics & Shipping",
        "description": "Capture bills of lading, packing lists, and proof of delivery.",
        "icon": "Truck",
        "doc_types": ["Bill of Lading", "Packing List", "Commercial Invoice", "Proof of Delivery"],
        "default_fields": {
            "Bill of Lading": [
                field("bol_number", "BOL Number", "text"),
                field("shipper_name", "Shipper Name", "text"),
                field("consignee_name", "Consignee Name", "text"),
                field("carrier_name", "Carrier Name", "text"),
                field("ship_date", "Ship Date", "date", DATE_RE),
                field("total_weight", "Total Weight", "number", NUMBER_RE),
            ],
            "Packing List": [
                field("shipment_id", "Shipment ID", "text"),
                field("item_description", "Item Description", "text"),
                field("quantity", "Quantity", "number", NUMBER_RE),
                field("total_packages", "Total Packages", "number", NUMBER_RE),
            ],
            "Commercial Invoice": [
                field("invoice_number", "Invoice Number", "text"),
                field("seller_name", "Seller Name", "text"),
                field("buyer_name", "Buyer Name", "text"),
                field("total_value", "Total Value", "currency", CURRENCY_RE),
                field("country_of_origin", "Country of Origin", "text"),
            ],
            "Proof of Delivery": [
                field("delivery_date", "Delivery Date", "date", DATE_RE),
                field("recipient_name", "Recipient Name", "text"),
                field("tracking_number", "Tracking Number", "text"),
                field("signature_present", "Signature Present", "text"),
            ],
        },
    },
]


async def seed() -> int:
    """Idempotently upsert all templates. Returns the number processed."""
    async with AsyncSessionLocal() as db:
        for spec in TEMPLATES:
            existing = (
                await db.execute(
                    select(IndustryTemplate).where(IndustryTemplate.key == spec["key"])
                )
            ).scalar_one_or_none()

            wf = workflow(f"{spec['name']} Pipeline", spec["doc_types"])
            values = {
                "name": spec["name"],
                "description": spec["description"],
                "icon": spec["icon"],
                "doc_types": spec["doc_types"],
                "default_fields": spec["default_fields"],
                "default_workflow_json": wf,
                "sample_document_url": spec.get("sample_document_url"),
                "is_active": True,
            }

            if existing is None:
                db.add(IndustryTemplate(key=spec["key"], **values))
                print(f"  + created template '{spec['key']}'")
            else:
                for attr, val in values.items():
                    setattr(existing, attr, val)
                print(f"  ~ updated template '{spec['key']}'")

        await db.commit()
    return len(TEMPLATES)


def main() -> None:
    count = asyncio.run(seed())
    print(f"Seeded {count} industry templates.")


if __name__ == "__main__":
    main()

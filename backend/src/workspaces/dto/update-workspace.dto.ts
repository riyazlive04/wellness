import { IsBoolean, IsEmail, IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class UpdateWorkspaceDto {
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  /** Public URL segment for /:slug. Lowercase letters, digits, hyphens. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'slug must be lowercase letters, numbers, and hyphens only',
  })
  slug?: string;
  @IsOptional() @IsString() @MaxLength(120) display_name?: string;
  /** Registered legal entity, shown on invoices. */
  @IsOptional() @IsString() @MaxLength(160) legal_name?: string;
  /** A hosted URL or a small (~256px) data: URI for the logo. */
  @IsOptional() @IsString() @MaxLength(500_000) logo_url?: string;
  /** 6- or 8-char hex (#RRGGBB / #RRGGBBAA), no validation here beyond length. */
  @IsOptional() @IsString() @MaxLength(9) brand_color?: string;
  /** Accent hex (#RRGGBB / #RRGGBBAA). */
  @IsOptional() @IsString() @MaxLength(9) brand_accent?: string;
  /** Shown on the client portal. */
  @IsOptional() @IsString() @MaxLength(200) tagline?: string;
  /** Private motivational quote shown on the owner's dashboard banner. */
  @IsOptional() @IsString() @MaxLength(280) dashboard_quote?: string;
  /** Enterprise: hide NUSI branding from the client portal + invoices. */
  @IsOptional() @IsBoolean() white_label?: boolean;
  @IsOptional() @IsEmail() contact_email?: string;
  @IsOptional() @IsString() @MaxLength(32) contact_phone?: string;
  /** IANA timezone, e.g. "Asia/Kolkata". */
  @IsOptional() @IsString() @MaxLength(64) timezone?: string;
  /** Default locale / language tag, e.g. "en-IN". */
  @IsOptional() @IsString() @MaxLength(16) locale?: string;
  @IsOptional() @IsString() @MaxLength(120) city?: string;
  @IsOptional() @IsString() @MaxLength(8) country_code?: string;
  @IsOptional() @IsString() @MaxLength(15) gstin?: string;
  @IsOptional() @IsString() @MaxLength(10) pan?: string;

  /** PDF header contact line, e.g. "+91 98… · hello@practice.in · practice.in". */
  @IsOptional() @IsString() @MaxLength(200) pdf_contact_line?: string;
  /** PDF footer note / disclaimer, printed above the page number. */
  @IsOptional() @IsString() @MaxLength(400) pdf_footer_note?: string;
  /**
   * Default invoice terms, copied onto each new invoice. Editing this never
   * rewrites invoices already issued - each keeps its own copy.
   * 4000 to match practice_invoices.terms.
   */
  @IsOptional() @IsString() @MaxLength(4000) invoice_terms?: string;

  // ── Bank details, printed on the invoices the practice issues ──────
  // Stored exactly as entered. Only the IFSC has a format worth checking;
  // account numbers vary by bank (9-18 digits) and a stricter rule here would
  // lock out real users, so it is length-checked only.
  /** Beneficiary name on the account. */
  @IsOptional() @IsString() @MaxLength(160) bank_account_name?: string;
  @IsOptional() @IsString() @MaxLength(32) bank_account_number?: string;
  @IsOptional() @IsString() @MaxLength(120) bank_name?: string;
  @IsOptional() @IsString() @MaxLength(160) bank_branch?: string;
  /** IFSC shape: 4 letters, a 0, then 6 alphanumerics. Blank clears it. */
  @IsOptional()
  @IsString()
  @MaxLength(11)
  @Matches(/^$|^[A-Za-z]{4}0[A-Za-z0-9]{6}$/, {
    message: 'bank_ifsc must be 11 characters in the form AAAA0XXXXXX',
  })
  bank_ifsc?: string;
  /** UPI VPA, e.g. "practice@okhdfcbank". */
  @IsOptional() @IsString() @MaxLength(120) bank_upi_id?: string;

  /** super_admin only (the controller rejects it for owners); plans are bought in Billing. */
  @IsOptional()
  @IsString()
  @MaxLength(32)
  plan?: string;

  /** Status changes are super_admin-only; controller enforces. */
  @IsOptional()
  @IsIn(['active', 'suspended', 'deleted'])
  status?: 'active' | 'suspended' | 'deleted';
}

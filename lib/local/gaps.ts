import type { Analysis, RiskCategory, Severity } from '@/lib/ai/schemas';

/**
 * Deterministic "missing protection" scan. Small on-device models are unreliable at noticing what
 * is *absent*, so this check is plain keyword search over the whole bundle: if a topic is never
 * mentioned anywhere, it is flagged for human review. It states exactly that and nothing more.
 */

type Gap = Analysis['gaps'][number];

interface GapCheck {
  title: string;
  pattern: RegExp;
  severity: Severity;
  category: RiskCategory;
  missing: string;
  recommendation: string;
}

const CHECKS: GapCheck[] = [
  {
    title: 'No indemnification language found',
    pattern: /indemnif|hold harmless/i,
    severity: 'high',
    category: 'indemnification',
    missing: 'indemnification or hold-harmless terms',
    recommendation: 'Add mutual indemnities for third-party IP claims, data breaches and breach of confidentiality.',
  },
  {
    title: 'No limitation of liability found',
    pattern: /limitation of liability|limit(?:s|ed|ation)? (?:of |on )?(?:its |their |the )?liabilit|liability (?:shall|will|is) (?:not|be) (?:exceed|limited)|aggregate liability|liability cap/i,
    severity: 'high',
    category: 'liability',
    missing: 'a cap or limitation on liability',
    recommendation: 'Add a liability cap (commonly 12 months of fees) with carve-outs for fraud, gross negligence and confidentiality.',
  },
  {
    title: 'No termination provisions found',
    pattern: /terminat/i,
    severity: 'high',
    category: 'termination',
    missing: 'termination rights or notice periods',
    recommendation: 'Define termination for cause, for convenience (if intended), notice periods and post-termination obligations.',
  },
  {
    title: 'No governing law or jurisdiction found',
    pattern: /governing law|governed by|jurisdiction|laws of (?:the )?(?:state|republic|kingdom|england|india|singapore)/i,
    severity: 'medium',
    category: 'dispute_resolution',
    missing: 'a governing-law or jurisdiction clause',
    recommendation: 'Specify governing law and exclusive venue or an arbitration seat.',
  },
  {
    title: 'No dispute resolution mechanism found',
    pattern: /arbitrat|mediation|dispute resolution|escalation/i,
    severity: 'low',
    category: 'dispute_resolution',
    missing: 'arbitration, mediation or an escalation procedure',
    recommendation: 'Add an escalation ladder followed by arbitration or courts of a named venue.',
  },
  {
    title: 'No confidentiality terms found',
    pattern: /confidential|non-disclosure|nondisclosure/i,
    severity: 'medium',
    category: 'confidentiality',
    missing: 'confidentiality or non-disclosure terms',
    recommendation: 'Add mutual confidentiality obligations with a defined term, exclusions and return/destroy duties.',
  },
  {
    title: 'No data-protection terms found',
    pattern: /personal data|data protection|gdpr|ccpa|privacy|data processor|processing of data/i,
    severity: 'medium',
    category: 'data_protection',
    missing: 'data-protection or privacy terms',
    recommendation: 'If personal data is processed, add a DPA (GDPR Art. 28 / CCPA service-provider terms) and breach-notification timelines.',
  },
  {
    title: 'No intellectual-property terms found',
    pattern: /intellectual property|copyright|patent|trade ?mark|work product|work made for hire/i,
    severity: 'medium',
    category: 'intellectual_property',
    missing: 'IP ownership or licensing terms',
    recommendation: 'State who owns deliverables and pre-existing IP, and grant the licences each party needs.',
  },
  {
    title: 'No warranties found',
    pattern: /warrant/i,
    severity: 'medium',
    category: 'warranty',
    missing: 'warranties or disclaimers',
    recommendation: 'Add performance and compliance warranties, remedies, and any disclaimer of implied warranties.',
  },
  {
    title: 'No assignment or change-of-control terms found',
    pattern: /assign(?:ment|s|ed)?\b|change of control|subcontract/i,
    severity: 'low',
    category: 'assignment',
    missing: 'assignment, subcontracting or change-of-control terms',
    recommendation: 'Restrict assignment and subcontracting without consent; address change of control.',
  },
  {
    title: 'No force majeure clause found',
    pattern: /force majeure|act of god|beyond (?:its|their|the parties'?) (?:reasonable )?control/i,
    severity: 'low',
    category: 'other',
    missing: 'a force majeure clause',
    recommendation: 'Add a force majeure clause with notice duties and a long-stop termination right.',
  },
  {
    title: 'No insurance requirements found',
    pattern: /insurance|insured/i,
    severity: 'low',
    category: 'other',
    missing: 'insurance requirements',
    recommendation: 'Require appropriate coverage (CGL, professional indemnity, cyber) with minimum limits.',
  },
];

/** Below this much text the corpus is too small for "never mentioned" to mean anything. */
const MIN_CHARACTERS = 1_500;

export function detectGaps(fullText: string, pageCount: number): Gap[] {
  if (fullText.length < MIN_CHARACTERS) return [];

  const gaps: Gap[] = [];
  for (const check of CHECKS) {
    if (check.pattern.test(fullText)) continue;
    gaps.push({
      id: `G${gaps.length + 1}`,
      title: check.title,
      severity: check.severity,
      category: check.category,
      description: `No mention of ${check.missing} was found anywhere in the ${pageCount} page${pageCount === 1 ? '' : 's'} scanned. This is a keyword scan, not legal analysis — confirm manually, especially for scanned or image-only pages.`,
      recommendation: check.recommendation,
    });
  }
  return gaps;
}

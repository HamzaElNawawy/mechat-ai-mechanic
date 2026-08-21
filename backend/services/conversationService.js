const { chooseLanguage } = require("./languageService");

const OUT_OF_SCOPE_REPLY =
  "Hello! I’m MeChat, an AI mechanic troubleshooting assistant. I can help you understand vehicle problems, maintenance questions, warning lights, unusual sounds, smells, smoke, leaks, or changes in how your vehicle drives. Are you experiencing a problem with your vehicle?";
const MAIN_PURPOSE_REMINDER =
  "My main purpose is helping you troubleshoot vehicle problems, but I can also provide brief additional information.";
const MAIN_PURPOSE_REMINDER_AR =
  "هدفي الأساسي هو مساعدتك في تشخيص مشكلات السيارة، لكن يمكنني أيضًا تقديم معلومات إضافية مختصرة.";

function getOutOfScopeReply() {
  return OUT_OF_SCOPE_REPLY;
}

function formatOffPurposeReply(reply, style, language = "english") {
  const normalizedReply = String(reply || "").trim();
  if (style !== "reminder") return normalizedReply;
  const reminder = chooseLanguage(
    language,
    MAIN_PURPOSE_REMINDER,
    MAIN_PURPOSE_REMINDER_AR
  );
  return `${reminder} ${normalizedReply}`.trim();
}

const POLICY_REPLIES = {
  secret_request: {
    english:
      "I can’t provide API keys, passwords, tokens, credentials, or other confidential information. I can explain MeChat’s capabilities at a general level.",
    arabic:
      "لا يمكنني تقديم مفاتيح API أو كلمات المرور أو الرموز أو بيانات الاعتماد أو أي معلومات سرية أخرى. يمكنني شرح إمكانات MeChat بصورة عامة.",
  },
  internal_instructions: {
    english:
      "I can’t provide hidden instructions, private configuration, or exact internal prompts. I can explain how MeChat works at a general level.",
    arabic:
      "لا يمكنني تقديم التعليمات المخفية أو الإعدادات الخاصة أو نصوص النظام الداخلية. يمكنني شرح طريقة عمل MeChat بصورة عامة.",
  },
  personal_data: {
    english: "I can’t provide another person’s or another user’s private information.",
    arabic: "لا يمكنني تقديم المعلومات الخاصة بشخص آخر أو مستخدم آخر.",
  },
  prompt_injection: {
    english:
      "I can’t ignore or override my safety, privacy, or mechanic-assistant boundaries. Are you experiencing a problem with your vehicle?",
    arabic:
      "لا يمكنني تجاهل أو تجاوز حدود السلامة والخصوصية ودوري كمساعد ميكانيكي. هل تواجه مشكلة في سيارتك؟",
  },
  unsafe_request: {
    english:
      "I can’t help with that unsafe request. I can help with safe vehicle troubleshooting and driving-safety guidance.",
    arabic:
      "لا يمكنني المساعدة في هذا الطلب غير الآمن. يمكنني مساعدتك في تشخيص السيارة بأمان وإرشادات سلامة القيادة.",
  },
};

const POLICY_BOUNDARY_RULES = [
  {
    reason: "secret_request",
    pattern:
      /\b(?:show|reveal|give|tell|print|send|provide)\b.{0,40}\b(?:api\s*key|password|access\s*token|secret\s*token|credential)s?\b/i,
  },
  {
    reason: "internal_instructions",
    pattern:
      /\b(?:show|reveal|give|print|repeat|provide)\b.{0,40}\b(?:system\s*prompt|hidden\s*instructions?|internal\s*prompt|private\s*configuration)\b/i,
  },
  {
    reason: "personal_data",
    pattern:
      /\b(?:show|reveal|give|provide)\b.{0,40}\b(?:another|other)\s+(?:user|person)(?:'s)?\s+(?:chat|conversation|private\s+data|personal\s+information)\b/i,
  },
  {
    reason: "prompt_injection",
    pattern:
      /\b(?:ignore|bypass|override|disable)\b.{0,40}\b(?:instructions?|rules?|system\s*prompt|safety|policy|policies)\b/i,
  },
  {
    reason: "secret_request",
    pattern: /(?:اعطني|أعطني|اظهر|أظهر|اكشف).{0,35}(?:مفتاح|كلمة مرور|رمز سري|بيانات الدخول)/u,
  },
  {
    reason: "prompt_injection",
    pattern: /(?:تجاهل|تجاوز|عطل).{0,35}(?:التعليمات|القواعد|الحماية|السياسة)/u,
  },
];

function assessPolicyBoundary(message) {
  const normalized = String(message || "").trim().replace(/\s+/g, " ");
  return POLICY_BOUNDARY_RULES.find(({ pattern }) => pattern.test(normalized))?.reason || null;
}

function getPolicyReply(reason, language = "english") {
  const replies = POLICY_REPLIES[reason] || POLICY_REPLIES.unsafe_request;
  return replies[language] || replies.english;
}

module.exports = {
  assessPolicyBoundary,
  formatOffPurposeReply,
  getOutOfScopeReply,
  getPolicyReply,
};

const { detectLanguage } = require("./languageService");

const RULES = [
  {
    id: "fire_or_smoke",
    pattern: /\b(engine|car|vehicle|hood|bonnet)\b(?:\s+\w+){0,4}\s+\b(on\s+fire|caught\s+fire|burning|ablaze|in\s+flames)\b|\b(on\s+fire|caught\s+fire|ablaze|in\s+flames)\b|\bflames?\b(?:\s+\w+){0,5}\s+\b(engine|car|vehicle|hood|bonnet)\b|\b(smoke|smoking)\b(?:\s+\w+){0,4}\s+\b(from|under|engine|car|vehicle|hood|bonnet)\b/i,
    arabicPattern: /(?:السيارة|العربية|المحرك|الكبوت).{0,30}(?:بتحترق|تحترق|مولعة|حريق|نار|دخان)|(?:حريق|نار|دخان).{0,30}(?:السيارة|العربية|المحرك|الكبوت)/u,
    severity: "critical",
    action: "shut_off_engine",
    message:
      "Stop in a safe place, switch off the engine, get everyone out, and move away from the vehicle. Do not open the hood if you see flames. Call emergency services for fire or heavy smoke, otherwise call roadside assistance. Do not drive the vehicle.",
    arabicMessage:
      "توقف في مكان آمن، وأطفئ المحرك، وأخرج الجميع، وابتعدوا عن السيارة. لا تفتح غطاء المحرك إذا رأيت لهبًا. اتصل بخدمات الطوارئ عند وجود حريق أو دخان كثيف، وإلا فاتصل بخدمة المساعدة على الطريق. لا تقُد السيارة.",
  },
  {
    id: "fuel_leak",
    pattern: /\b(fuel|gas(?:oline)?|petrol)\b.{0,45}\b(leak(?:ing)?|smell|odor|odour|drip(?:ping)?|pouring|puddle)\b|\b(leak(?:ing)?|smell|odor|odour|drip(?:ping)?|pouring|puddle)\b.{0,45}\b(fuel|gas(?:oline)?|petrol)\b/i,
    arabicPattern: /(?:بنزين|وقود).{0,30}(?:تسريب|يسرب|بيسرب|رائحة|ريحة|تنقيط)|(?:تسريب|رائحة|ريحة).{0,30}(?:بنزين|وقود)/u,
    severity: "critical",
    action: "shut_off_engine",
    message:
      "Stop safely and switch off the engine. Keep away from flames, sparks, and cigarettes. Do not restart or drive the vehicle; call roadside assistance for a tow and emergency services if fuel is pooling or there is fire.",
    arabicMessage:
      "توقف بأمان وأطفئ المحرك. ابتعد عن اللهب والشرر والسجائر. لا تُعد تشغيل السيارة ولا تقُدها؛ اتصل بالمساعدة على الطريق لسحبها، واتصل بالطوارئ إذا كان الوقود متجمعًا أو يوجد حريق.",
  },
  {
    id: "brake_failure",
    pattern: /\b(no\s+brakes?|brakes?\s+(?:failed|gone|not\s+working|won't\s+work|dont\s+work|don't\s+work)|brake\s+pedal\s+(?:goes?|went|sinks?|fell)?\s*(?:to|on)\s+the\s+floor|brake\s+pedal.{0,20}(?:no\s+pressure|soft|limp)|cannot\s+stop|can't\s+stop|wont\s+stop|won't\s+stop)\b/i,
    arabicPattern: /(?:الفرامل|الفرامل|البريك).{0,30}(?:لا تعمل|مش شغالة|مش بتشتغل|فشلت|راحت|من غير ضغط)|(?:مش قادر|لا أستطيع|لا استطيع).{0,20}(?:أوقف|اوقف|أوقف السيارة|اوقف السيارة)/u,
    severity: "critical",
    action: "call_roadside_assistance",
    message:
      "Do not continue driving. If the vehicle is moving, ease off the accelerator, use hazard lights, downshift gradually, and apply the parking brake gently only if needed. Once stopped safely, call roadside assistance for a tow.",
    arabicMessage:
      "لا تواصل القيادة. إذا كانت السيارة تتحرك، ارفع قدمك عن دواسة الوقود، وشغّل إشارات التحذير، وخفّض السرعة تدريجيًا، واستخدم فرامل اليد برفق فقط عند الضرورة. بعد التوقف بأمان، اتصل بالمساعدة على الطريق لسحب السيارة.",
  },
  {
    id: "steering_failure",
    pattern: /\b(lost\s+(?:all\s+)?steering|steering\s+(?:is\s+|has\s+)?(?:failed|gone|locked|stuck|not\s+working|won't\s+turn)|cannot\s+steer|can't\s+steer|wont\s+steer|won't\s+steer|wheel\s+will\s+not\s+turn)\b/i,
    arabicPattern: /(?:الدركسيون|المقود).{0,30}(?:لا يتحرك|مش بيتحرك|قفل|مقفول|عالق|لا يعمل|مش شغال|مش بيلف)/u,
    severity: "critical",
    action: "call_roadside_assistance",
    message:
      "Do not continue driving. Slow down without sudden braking, use hazard lights, and stop in the safest available place. Call roadside assistance for a tow.",
    arabicMessage:
      "لا تواصل القيادة. خفّض السرعة من دون فرملة مفاجئة، وشغّل إشارات التحذير، وتوقف في أكثر مكان آمن متاح. اتصل بالمساعدة على الطريق لسحب السيارة.",
  },
  {
    id: "overheating",
    pattern: /\b(overheat(?:ing|ed)?|temperature\s+(?:gauge|light|needle).{0,25}(?:red|hot|high|max(?:imum)?|max(?:ed)?\s+out)|temp(?:erature)?\s+(?:is\s+)?(?:red|too\s+hot|max(?:ed)?\s+out)|coolant\s+(?:is\s+)?boiling|steam\s+(?:coming\s+)?(?:from|under)\s+(?:the\s+)?(?:hood|bonnet))\b/i,
    arabicPattern: /(?:السيارة|العربية|المحرك).{0,25}(?:سخنت|بتسخن|حرارتها عالية|حرارته عالية)|(?:مؤشر الحرارة|درجة الحرارة|حرارة السيارة).{0,25}(?:عالي|عالية|الأحمر|احمر|مرتفعة)|بخار.{0,20}(?:الكبوت|المحرك)/u,
    severity: "critical",
    action: "shut_off_engine",
    message:
      "Pull over safely and switch off the engine. Do not open the radiator or coolant cap while hot. Let the vehicle cool and arrange roadside assistance; continuing to drive can cause severe engine damage.",
    arabicMessage:
      "توقف بأمان وأطفئ المحرك. لا تفتح غطاء الردياتير أو سائل التبريد وهو ساخن. اترك السيارة تبرد واتصل بالمساعدة على الطريق؛ استمرار القيادة قد يسبب تلفًا شديدًا للمحرك.",
  },
];

function hasLocalNegation(message, matchIndex) {
  const prefix = message.slice(Math.max(0, matchIndex - 18), matchIndex).toLowerCase();
  return /\b(no|not|without|isn't|isnt|wasn't|wasnt)\b/.test(prefix);
}

function assessImmediateDanger(message) {
  for (const rule of RULES) {
    const match = rule.pattern.exec(message) || rule.arabicPattern?.exec(message);
    if (match && !hasLocalNegation(message, match.index)) {
      const language = detectLanguage(message);
      return {
        message: language === "arabic" ? rule.arabicMessage : rule.message,
        severity: rule.severity,
        action: rule.action,
        needsMechanic: true,
        reason: rule.id,
      };
    }
  }
  return null;
}

function buildDangerResponse(category, language = "english") {
  const rule = RULES.find((candidate) => candidate.id === category);
  if (rule) {
    return {
      message: language === "arabic" ? rule.arabicMessage : rule.message,
      severity: rule.severity,
      action: rule.action,
      needsMechanic: true,
      reason: rule.id,
    };
  }

  if (category === "other_critical") {
    return {
      message:
        language === "arabic"
          ? "توقف في أكثر مكان آمن متاح ولا تواصل القيادة. إذا كان أي شخص في خطر فوري فاتصل بخدمات الطوارئ؛ وإلا فاتصل بالمساعدة على الطريق للحصول على مساعدة متخصصة."
          : "Stop in the safest available place and do not continue driving. If anyone is in immediate danger, call emergency services; otherwise call roadside assistance for professional help.",
      severity: "critical",
      action: "call_roadside_assistance",
      needsMechanic: true,
      reason: category,
    };
  }

  return null;
}

module.exports = { assessImmediateDanger, buildDangerResponse };

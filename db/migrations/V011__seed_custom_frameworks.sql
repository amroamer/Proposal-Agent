-- ============================================================
-- V011__seed_custom_frameworks.sql
-- Purpose:
--   Ship the two custom-built review frameworks (Amro, Basil) to
--   any environment that doesn't already have them. Both are
--   inserted with full bilingual content (EN + AR personas, EN +
--   AR criteria) so a brand-new server gets the same starting set
--   as the original developer laptop.
--
--   This is the "seed only what's safe" pattern (chosen 2026-05-09):
--   migrations carry the canonical seed data; nothing on the VM
--   gets overwritten if it already exists. To ship a new framework
--   to the server going forward, add a similarly-shaped INSERT in a
--   later migration.
--
-- Idempotency: each INSERT is guarded by `WHERE NOT EXISTS (... name)`
-- so re-runs are no-ops on every machine that already has the row.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- Amro Framework
-- ------------------------------------------------------------
INSERT INTO review_frameworks
    (owner_user_id, name, persona_instruction, persona_instruction_ar, model, is_public, criteria)
SELECT
    NULL,
    'Amro Framework',
    'You are a top-tier management consultant from KPMG evaluating a critical proposal.',
    $$أنت مستشار إدارة من الطراز الأول لدى كي بي إم جي تقوم بتقييم عرض حيوي ومهم.$$,
    'gemma4:latest',
    TRUE,
    $JSON$
[
  {
    "group": "",
    "name_en": "Executive summary coverage",
    "name_ar": "تغطية الملخص التنفيذي",
    "description_en": "Are we covering all the needed items in the SOW coverage ",
    "description_ar": "هل نقوم بتغطية جميع البنود المطلوبة ضمن نطاق العمل؟",
    "prompt_instruction_en": "are we covering all of those topics in the executive summary section : \nour understanding of your requirements \nour value proposition \nour point of view \nour approach \nour timeline \nour team structure \nassumptions \nour tools and methodologies \n",
    "prompt_instruction_ar": "هل نقوم بتغطية جميع هذه المواضيع في قسم الملخص التنفيذي:\nفهمنا لمتطلباتكم\nعرض قيمتنا\nوجهة نظرنا\nمنهجيتنا\nالجدول الزمني\nهيكل الفريق\nالافتراضات\nأدواتنا ومنهجياتنا\n"
  },
  {
    "group": "",
    "name_en": "Scope of work Coverage",
    "name_ar": "تغطية نطاق العمل",
    "description_en": "do we have boundaries for the SOW ",
    "description_ar": "هل لدينا حدود واضحة لنطاق العمل؟",
    "prompt_instruction_en": "do we have clear scope coverage and boundaries ?\nAll deliverables are quantified ? \n",
    "prompt_instruction_ar": "هل لدينا تغطية واضحة للنطاق وحدوده؟\nهل جميع المخرجات محددة كمياً؟\n"
  }
]
$JSON$::jsonb
WHERE NOT EXISTS (
    SELECT 1 FROM review_frameworks WHERE name = 'Amro Framework'
);

-- ------------------------------------------------------------
-- Basil Framework
-- ------------------------------------------------------------
INSERT INTO review_frameworks
    (owner_user_id, name, persona_instruction, persona_instruction_ar, model, is_public, criteria)
SELECT
    NULL,
    'Basil Framework',
    'You are a senior proposal quality assurance reviewer at a top-tier consulting firm. Your role is to perform a comprehensive readiness assessment of consulting proposals before submission. Be rigorous, specific, and actionable in your evaluations. Always cite page/slide numbers. Use tables where instructed. Flag issues with zero tolerance for client name errors and compliance gaps.',
    $$أنت مراجع كبير لضمان جودة العروض في شركة استشارات من الطراز الأول. دورك هو إجراء تقييم شامل لجاهزية العروض الاستشارية قبل تقديمها. كن صارماً ومحدداً وعملياً في تقييماتك. اذكر دائماً أرقام الصفحات/الشرائح. استخدم الجداول عند الطلب. أبلغ عن المشكلات مع عدم التسامح إطلاقاً مع أخطاء أسماء العملاء وفجوات الامتثال.$$,
    'gemma4:latest',
    TRUE,
    $JSON$
[
  {
    "group": "Assessment",
    "name_en": "Proposal Assessment Summary",
    "name_ar": "ملخص تقييم العرض",
    "description_en": "Comprehensive summary including overall readiness score, section-by-section readiness table, and scope coverage verification against RFP requirements.",
    "description_ar": "ملخص شامل يتضمن درجة الجاهزية الإجمالية، وجدول جاهزية كل قسم، والتحقق من تغطية النطاق مقابل متطلبات طلب العرض.",
    "prompt_instruction_en": "A. Overall Score\nFirst, present on a table:\n\nProposal Name (from the first slide you can find the project and client name)\nOverall score of the proposal section's readiness and RAG color\nSummary of recommendations (no more than 2 lines).\n\nB. Proposal sections readiness\nYou can identify the sections from the table of contents slides, which show all the sections. I need to list the sections, and the maturity of this section, rating from 1-10, RAG color status, gaps, and recommendations, and go/no go decision (go should be scored 7 or more and have no must-fix issues). Present the detailed table of sections' readiness as highlighted above.\n\nC. Scope Coverage\nVerify that every requirement and deliverable is explicitly addressed in the proposal, properly reflected in:\n\nApproach & methodology\nDeliverables Timeline\nTeam & roles\n\nList every scope item with proper sequence number, and for each one, present status (no need to have column for each of the 3 component above as the finding can be summarized in the status column), flag: Missing items, Partially addressed items, Over-promising beyond scope, and recommendation and must-do fixes to avoid disqualification.",
    "prompt_instruction_ar": "أ. الدرجة الإجمالية\nأولاً، اعرض في جدول:\n\nاسم العرض (من الشريحة الأولى يمكنك إيجاد اسم المشروع والعميل)\nالدرجة الإجمالية لجاهزية أقسام العرض ولون مؤشر الإشارة (RAG)\nملخص التوصيات (لا يزيد عن سطرين).\n\nب. جاهزية أقسام العرض\nيمكنك تحديد الأقسام من شرائح جدول المحتويات التي تعرض جميع الأقسام. أحتاج إلى سرد الأقسام، ومدى نضج كل قسم، بتقييم من 1 إلى 10، ولون مؤشر الإشارة (RAG)، والثغرات والتوصيات، وقرار المضي/عدم المضي (ينبغي أن تكون الدرجة 7 فأكثر دون أي مشكلات يجب إصلاحها). اعرض الجدول التفصيلي لجاهزية الأقسام كما هو موضح أعلاه.\n\nج. تغطية النطاق\nتحقق من أن كل متطلب ومخرج مذكور صراحةً في العرض، وأنه ينعكس بشكل صحيح في:\n\nالمنهجية والأسلوب\nالجدول الزمني للمخرجات\nالفريق والأدوار\n\nاسرد كل بند من بنود النطاق برقم تسلسلي صحيح، ولكلٍّ منها اعرض الحالة (لا حاجة لعمود لكل مكوّن من المكونات الثلاثة المذكورة أعلاه إذ يمكن تلخيص النتائج في عمود الحالة)، وأبلغ عن: البنود المفقودة، والبنود المُعالَجة جزئياً، والإفراط في الوعد بما يتجاوز النطاق، والتوصية والإصلاحات الواجبة لتجنّب الاستبعاد."
  },
  {
    "group": "Strategy",
    "name_en": "Value Proposition",
    "name_ar": "عرض القيمة",
    "description_en": "Evaluation of the proposal's unique value proposition, competitive differentiation, and supporting evidence for why the firm is the right partner.",
    "description_ar": "تقييم لعرض القيمة الفريد للعرض، والتمايز التنافسي، والأدلة الداعمة لسبب كون الشركة هي الشريك الأنسب.",
    "prompt_instruction_en": "Check the slide which is labeled (why us, or we believe we are the right partner to work with you) usually in the executive summary.\nValidate if each component is solid and strongly explained and supported with evidence.\nAlso, check how it is unique collectively compared with other competitors, who may have similar value propositions, or these are unique to us. You can research other companies online.\nPropose whether there is any interesting and strong addition based on your analysis of the proposal.",
    "prompt_instruction_ar": "تحقق من الشريحة المُعنونة (لماذا نحن، أو نعتقد أننا الشريك المناسب للعمل معكم) عادةً ما تكون في الملخص التنفيذي.\nتحقق مما إذا كان كل عنصر متيناً ومشروحاً بقوة ومدعوماً بأدلة.\nتحقق أيضاً من مدى تميّزه بشكل جماعي مقارنةً بالمنافسين الآخرين الذين قد تكون لديهم عروض قيمة مماثلة، أو ما إذا كانت هذه العروض فريدة من نوعها لنا. يمكنك البحث عن شركات أخرى عبر الإنترنت.\nاقترح ما إذا كانت هناك إضافة مثيرة للاهتمام وقوية بناءً على تحليلك للعرض."
  },
  {
    "group": "Delivery",
    "name_en": "Project Approach",
    "name_ar": "منهجية المشروع",
    "description_en": "Detailed validation of project phases, activities, dependencies, methodologies, sequencing logic, and alignment with leading practices and RFP scope.",
    "description_ar": "تحقّق تفصيلي من مراحل المشروع، والأنشطة، والاعتماديات، والمنهجيات، ومنطق التسلسل، والتوافق مع أفضل الممارسات ونطاق طلب العرض.",
    "prompt_instruction_en": "A. Phases clarity\nPresent in a table the readiness of each phase by listing the phase # and name, and ensuring that the right objectives, activities, deliverables, duration (adequate to deliver), and depth of content, check if these are good to go, and in compliance with the scope requirements, along with the RAG status, issues and required fixes, if any.\n\nB. Detailed analysis of the approach:\nThen list more details by validating the logic, sequencing, and realism of: Phases Activities, Dependencies, Outputs. Identify the following:\n\nIllogical sequences of activities\nVague or generic consulting language and highlight Activities that do not lead to a clear deliverable.\nNot suitable/relevant Methodologies\nMissing clear requirements or deliverables as per the RFP scope and requirements\nFlag any consulting fluff or technically weak content.\nShow the issues and gaps, and recommendations to address the gaps.\n\nC. Efficiency Improvement recommendations\nIdentify any efficiencies can be done on the approach and activities to reduce efforts and improve outcomes.\n\nD. Recommendations to align with leading practices\nProvide a detailed recommendation on the scope, which may consider the following:\n\nRecommend any improvements in the methodology and approach based on relevant leading practices and standards, with clear reference to this.\nIdentify any efficiencies can be done on the approach to reduce efforts and improve outcomes.",
    "prompt_instruction_ar": "أ. وضوح المراحل\nاعرض في جدول جاهزية كل مرحلة من خلال سرد رقم المرحلة واسمها، والتأكد من وجود الأهداف الصحيحة، والأنشطة، والمخرجات، والمدة (الكافية للتنفيذ)، وعمق المحتوى، وتحقق مما إذا كانت هذه جاهزة للمضي قدماً ومتوافقة مع متطلبات النطاق، إلى جانب حالة مؤشر الإشارة (RAG)، والمشكلات والإصلاحات المطلوبة، إن وجدت.\n\nب. التحليل التفصيلي للمنهجية:\nثم اسرد المزيد من التفاصيل من خلال التحقق من المنطق والتسلسل والواقعية لـ: أنشطة المراحل، والاعتماديات، والمخرجات. حدّد ما يلي:\n\nالتسلسلات غير المنطقية للأنشطة\nلغة الاستشارات المبهمة أو العامة، وأبرز الأنشطة التي لا تؤدي إلى مخرج واضح.\nالمنهجيات غير المناسبة/غير ذات الصلة\nالمتطلبات أو المخرجات المفقودة وفقاً لنطاق طلب العرض ومتطلباته\nأبلغ عن أي حشو استشاري أو محتوى ضعيف تقنياً.\nاعرض المشكلات والثغرات والتوصيات لمعالجة الثغرات.\n\nج. توصيات تحسين الكفاءة\nحدّد أي تحسينات يمكن إجراؤها على المنهجية والأنشطة لتقليل الجهد وتحسين النتائج.\n\nد. التوصيات للتوافق مع أفضل الممارسات\nقدّم توصية تفصيلية حول النطاق، والتي قد تشمل ما يلي:\n\nاقترح أي تحسينات في المنهجية والأسلوب بناءً على أفضل الممارسات والمعايير ذات الصلة، مع إشارة واضحة إلى مصادرها.\nحدّد أي تحسينات يمكن إجراؤها على المنهجية لتقليل الجهد وتحسين النتائج."
  },
  {
    "group": "Delivery",
    "name_en": "Timeline & Duration Consistency",
    "name_ar": "اتساق الجدول الزمني والمدة",
    "description_en": "Cross-validation of all timeline references, phase durations, milestones, and detection of contradictions across the proposal slides.",
    "description_ar": "تحقّق متبادل من جميع مراجع الجدول الزمني، ومدد المراحل، والمعالم الرئيسية، واكتشاف التناقضات عبر شرائح العرض.",
    "prompt_instruction_en": "Cross-check all references to: Project duration, Phase durations, Milestones.\nEnsure: Numbers match across all slides, Timeline is realistic for the scope, and no contradictions exist.\nKeep in mind when reading the timeline multiple factors: the overlaps which you can find in the timeline table, and also the timeline mentioned in the detailed scope of work, which maybe focused on the sub-phase listed in the slide not the whole phase.\nIf there are inconsistencies in the time and durations across, highlight clearly.",
    "prompt_instruction_ar": "تحقّق متبادل من جميع المراجع لـ: مدة المشروع، ومدد المراحل، والمعالم الرئيسية.\nتأكد من: تطابق الأرقام عبر جميع الشرائح، وأن الجدول الزمني واقعي للنطاق، وعدم وجود تناقضات.\nضع في اعتبارك عند قراءة الجدول الزمني عدة عوامل: التداخلات التي يمكنك إيجادها في جدول الجدول الزمني، وأيضاً الجدول الزمني المذكور في نطاق العمل التفصيلي الذي قد يكون مركّزاً على مرحلة فرعية مدرجة في الشريحة لا على المرحلة الكاملة.\nإذا كانت هناك تناقضات في الأوقات والمدد عبر العرض، فأبرزها بوضوح."
  },
  {
    "group": "Team",
    "name_en": "Team Profiles",
    "name_ar": "ملفات تعريف الفريق",
    "description_en": "Review of team structure, role consistency, CV relevance, seniority alignment, and proposed man-day allocations with pyramid structure validation.",
    "description_ar": "مراجعة هيكل الفريق، واتساق الأدوار، وملاءمة السير الذاتية، وتوافق الدرجات الوظيفية، وتخصيصات أيام العمل المقترحة مع التحقق من الهيكل الهرمي.",
    "prompt_instruction_en": "Review teams related content (executive summary and in the team-related sections), including the team project structure, team bio, and CVs, roles.\n\nA. List all project roles, names, title/level, relevancy of profile as per the CV, and suitability levels (and comments/recommendations) considering the following:\n\nConsistency of using the titles, roles across the different slides for every team member or profile listed in the proposal.\nRelevance of experience and seniority level related to work and scope.\nWeak or misaligned experience CVs require tailoring.\nAdd any missing roles that should be added to deliver the scope.\n\nB. Proposed Man-days\nProvide a table showing your recommendation on the required efforts by listing level, role, name and number of man-days (by phase, and total), along with total man-days summary. Show what you are recommending and the actual (from the proposal if any).\nKeep in mind to have a pyramid structure where partner involvement is around 3-8%, and director involvement is around 10-30% depending on the complexity.",
    "prompt_instruction_ar": "راجع المحتوى المتعلق بالفِرَق (الملخص التنفيذي والأقسام المتعلقة بالفريق)، بما في ذلك هيكل فريق المشروع، والسير الذاتية للفريق، والأدوار.\n\nأ. اسرد جميع أدوار المشروع، والأسماء، والمسمى الوظيفي/المستوى، ومدى ملاءمة الملف الشخصي وفقاً للسيرة الذاتية، ومستويات الملاءمة (والتعليقات/التوصيات) مع مراعاة ما يلي:\n\nاتساق استخدام المسميات والأدوار عبر الشرائح المختلفة لكل عضو فريق أو ملف شخصي مدرج في العرض.\nملاءمة الخبرة ومستوى الأقدمية المتعلق بالعمل والنطاق.\nالسير الذاتية ذات الخبرة الضعيفة أو غير المتوافقة التي تتطلب تعديلاً.\nأضف أي أدوار مفقودة ينبغي إضافتها لتنفيذ النطاق.\n\nب. أيام العمل المقترحة\nقدّم جدولاً يوضح توصيتك بشأن الجهود المطلوبة من خلال سرد المستوى، والدور، والاسم، وعدد أيام العمل (حسب المرحلة، والإجمالي)، إلى جانب ملخص إجمالي أيام العمل. أظهر ما توصي به والفعلي (من العرض إن وجد).\nضع في اعتبارك وجود هيكل هرمي حيث تكون مشاركة الشريك حوالي 3-8%، ومشاركة المدير حوالي 10-30% بحسب التعقيد."
  },
  {
    "group": "Compliance",
    "name_en": "Legal Document",
    "name_ar": "المستندات القانونية",
    "description_en": "Compliance check of all legal and regulatory documents including validity dates, correct client naming, and identification of expired or missing documents.",
    "description_ar": "التحقق من امتثال جميع المستندات القانونية والتنظيمية بما في ذلك تواريخ الصلاحية، وصحة تسمية العميل، وتحديد المستندات المنتهية أو المفقودة.",
    "prompt_instruction_en": "Review all legal/compliance documents provided (including screenshots). Check: Issue dates, Expiry dates, Validity at proposal submission date (mentioned on the cover page), correct client name (where applicable such as the bank bond).\nIn the output table, clearly present the issue date, expiry date/validity (considering extensions if any).\nFlag: Expired or soon-to-expire documents, Missing documents, Name mismatches.",
    "prompt_instruction_ar": "راجع جميع المستندات القانونية/مستندات الامتثال المقدمة (بما في ذلك لقطات الشاشة). تحقق من: تواريخ الإصدار، وتواريخ انتهاء الصلاحية، والصلاحية في تاريخ تقديم العرض (المذكور على صفحة الغلاف)، واسم العميل الصحيح (حيثما ينطبق ذلك مثل الضمان البنكي).\nفي جدول المخرجات، اعرض بوضوح تاريخ الإصدار وتاريخ انتهاء الصلاحية/الصلاحية (مع مراعاة التمديدات إن وجدت).\nأبلغ عن: المستندات المنتهية أو التي ستنتهي قريباً، والمستندات المفقودة، وعدم تطابق الأسماء."
  },
  {
    "group": "Compliance",
    "name_en": "Client Name & Entity Consistency Check",
    "name_ar": "التحقق من اتساق اسم العميل والكيان",
    "description_en": "Zero-tolerance verification that only the correct client name and entity type is used throughout the proposal, flagging any legacy references or incorrect terminology.",
    "description_ar": "تحقّق بعدم تسامح من أن اسم العميل وكيانه الصحيح فقط هو المستخدم في جميع أنحاء العرض، مع الإبلاغ عن أي مراجع قديمة أو مصطلحات غير صحيحة.",
    "prompt_instruction_en": "Verify that only the correct client's name is used throughout. Identify: Any other entity names, Legacy client references, Incorrect terminology (entity, authority, center, company, etc.) used to refer to the client which does not match their legal status.\nCheck if there is any use of other client name or incorrect terminology, highlight it with zero tolerance, and mention the page number and slide title for every entity mention (other than the client targeted for the proposal). If it was used under credentials/case study/previous experience or CV slides, then maybe highlight it as acceptable (but still you need to show). Otherwise, it is having to be labeled as red flag, and must be fixed.\nCapture every other client or entity's reference or name (excluding the original client's name) and show in the results even if it was acceptable.",
    "prompt_instruction_ar": "تحقق من أن اسم العميل الصحيح فقط هو المستخدم في جميع أنحاء العرض. حدّد: أي أسماء كيانات أخرى، أو مراجع لعملاء قدامى، أو مصطلحات غير صحيحة (كيان، هيئة، مركز، شركة، إلخ.) تشير إلى العميل ولا تتطابق مع وضعه القانوني.\nتحقق مما إذا كان هناك أي استخدام لاسم عميل آخر أو مصطلحات غير صحيحة، فأبرزه بعدم تسامح، واذكر رقم الصفحة وعنوان الشريحة لكل ذِكر لكيان (بخلاف العميل المستهدف للعرض). إذا تم استخدامه ضمن شرائح المؤهلات/دراسة الحالة/الخبرة السابقة أو السيرة الذاتية، فقد يكون مقبولاً (ولكن لا يزال عليك إظهاره). وإلا فيجب وضع علامة عليه كإشارة حمراء، ويجب إصلاحه.\nالتقط كل مرجع أو اسم لعميل أو كيان آخر (باستثناء اسم العميل الأصلي) واعرضه في النتائج حتى لو كان مقبولاً."
  },
  {
    "group": "Risk",
    "name_en": "Risks & Assumptions",
    "name_ar": "المخاطر والافتراضات",
    "description_en": "Identification of key project risks, scope creep triggers, and evaluation of proposal assumptions for potential disqualification issues with rewording recommendations.",
    "description_ar": "تحديد المخاطر الرئيسية للمشروع، ومحفزات توسّع النطاق، وتقييم افتراضات العرض للمسائل المحتملة للاستبعاد مع توصيات إعادة الصياغة.",
    "prompt_instruction_en": "A. Risks\nList top ten key potential risks that may lead to scope creep or failure of the project, check if the assumptions in the proposals are enough to mitigate them and propose changes or scope limitations/assumptions that need to be added to address that.\n\nB. Assumptions\nList the key scope-related assumptions and limitations, and your view if these will cause an issue (disqualify us), and your recommendation in rewording them to avoid that.",
    "prompt_instruction_ar": "أ. المخاطر\nاسرد أهم عشر مخاطر محتملة قد تؤدي إلى توسّع النطاق أو فشل المشروع، وتحقق مما إذا كانت الافتراضات في العرض كافية للتخفيف منها واقترح تغييرات أو قيود/افتراضات للنطاق ينبغي إضافتها لمعالجة ذلك.\n\nب. الافتراضات\nاسرد الافتراضات والقيود الرئيسية المتعلقة بالنطاق، ورأيك حول ما إذا كانت ستسبّب مشكلة (تستبعدنا)، وتوصيتك في إعادة صياغتها لتجنّب ذلك."
  },
  {
    "group": "Quality",
    "name_en": "Proofreading & Consistency Check",
    "name_ar": "التدقيق اللغوي والتحقق من الاتساق",
    "description_en": "Strict editorial review covering grammar, spelling, numbering consistency, terminology usage, contradictions, and formatting issues across all proposal content.",
    "description_ar": "مراجعة تحريرية صارمة تشمل النحو والإملاء، واتساق الترقيم، واستخدام المصطلحات، والتناقضات، ومشكلات التنسيق عبر جميع محتوى العرض.",
    "prompt_instruction_en": "Conduct a strict proofreading review covering: Grammar, spelling, punctuation, Consistent terminology usage, Consistency of: Numbers, Phases, Deliverable, Activity numbering, Section references, page numbering, Detect contradictions such as: 3 phases in one section vs 4 in another, Different names for the same deliverable. This needs to be detailed.\n\nA. List all inconsistencies.\nB. List all typos and grammar mistakes.\nC. List all unclear terminologies not defined.\nD. List all major punctuation issues.\nE. List any rewording proposed on the slide title/heading.",
    "prompt_instruction_ar": "نفّذ مراجعة تدقيق لغوي صارمة تشمل: النحو والإملاء وعلامات الترقيم، الاستخدام المتسق للمصطلحات، اتساق: الأرقام، والمراحل، والمخرجات، وترقيم الأنشطة، ومراجع الأقسام، وترقيم الصفحات، اكتشاف التناقضات مثل: 3 مراحل في قسم واحد مقابل 4 في آخر، أو أسماء مختلفة لنفس المخرج. ينبغي أن يكون هذا تفصيلياً.\n\nأ. اسرد جميع التناقضات.\nب. اسرد جميع الأخطاء المطبعية والنحوية.\nج. اسرد جميع المصطلحات غير الواضحة وغير المعرّفة.\nد. اسرد جميع مشكلات الترقيم الرئيسية.\nهـ. اسرد أي إعادة صياغة مقترحة على عنوان/رأس الشريحة."
  }
]
$JSON$::jsonb
WHERE NOT EXISTS (
    SELECT 1 FROM review_frameworks WHERE name = 'Basil Framework'
);

INSERT INTO migrations_history (version, description)
VALUES ('V011', 'review_frameworks: seed Amro + Basil custom frameworks (idempotent)')
ON CONFLICT (version) DO NOTHING;

COMMIT;

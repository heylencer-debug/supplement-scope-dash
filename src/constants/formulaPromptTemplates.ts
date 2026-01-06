import { 
  FlaskConical, 
  ShieldAlert, 
  Stethoscope, 
  DollarSign, 
  Clock, 
  Star, 
  Heart,
  Minimize2, 
  AlertTriangle,
  Eye,
  LucideIcon
} from "lucide-react";

export interface OptimizationStep {
  id: string;
  title: string;
  description: string;
}

export interface HardPrompt {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
  prompt: string;
}

export const OPTIMIZATION_STEPS: OptimizationStep[] = [
  {
    id: "step1",
    title: "Ingredient Reduction & Optimization",
    description: "Identify ingredients to reduce, increase, or remove"
  },
  {
    id: "step2", 
    title: "Flavor Strategy & Palatability Ranking",
    description: "Recommend and rank flavors for acceptance"
  },
  {
    id: "step3",
    title: "Optimal Pack Size & Unit Economics",
    description: "Recommend unit count and justify based on consumption"
  },
  {
    id: "step4",
    title: "Dosing Strategy by Animal Type",
    description: "Provide dosing guidance for different sizes"
  },
  {
    id: "step5",
    title: "Final Optimization Summary",
    description: "What to simplify, double down on, and the single best change"
  }
];

export const FULL_OPTIMIZATION_PROMPT = `You are a senior expert in canine & feline supplement formulation and commercialization, with hands-on experience in:
- Ingredient optimization and dose-response analysis
- Palatability science and flavor systems for pets
- Digestive tolerance in dogs and cats
- Product sizing, dosing logic, and compliance
- Amazon / DTC commercial performance

I will provide you with a complete supplement formula.
Your task is to critically optimize the product, not redesign it for marketing appeal.

**Step 1 – Ingredient Reduction & Optimization**
• Identify ingredients that should be:
  - Reduced in dosage
  - Increased
  - Removed entirely
• Explain:
  - Which ingredients deliver diminishing returns
  - Which create digestive or palatability risk at current levels
• Recommend a leaner, more effective version of the formula

**Step 2 – Flavor Strategy & Palatability Ranking**
• Recommend flavors that are:
  - Highly accepted by dogs
  - Highly accepted by cats (if applicable)
• Rank flavors from most likely to be accepted → least
• Consider:
  - Protein-based flavors (e.g. beef, chicken, salmon)
  - Non-meat flavors (cheese, yeast, umami)
  - Masking strategies for bitter or mineral-heavy formulas
• Identify flavors to avoid due to low compliance or digestive issues

**Step 3 – Optimal Pack Size & Unit Economics**
• Recommend:
  - Total unit count per package
  - Net weight (if powder)
• Justify based on:
  - Average consumption rate
  - Customer repurchase behavior
  - Shelf life and freshness
• Indicate whether multiple pack sizes should exist at launch

**Step 4 – Dosing Strategy by Animal Type**
• Provide dosing guidance for:
  - Small / medium / large dogs
  - Cats (if appropriate)
• Address:
  - Daily serving size
  - Maximum safe dosage
  - Whether loading phases are appropriate
• Highlight risks of over- or under-dosing

**Step 5 – Final Optimization Summary**
- What would you simplify?
- What would you double down on?
- What single change would most improve real-world results?

Write clearly, critically, and decisively.
Optimize for effectiveness and compliance — not label density.`;

export const HARD_PROMPTS: HardPrompt[] = [
  {
    id: "redteam",
    title: "Red Team: Kill This Product If You Can",
    description: "Find every reason this product could fail",
    icon: ShieldAlert,
    prompt: `Act as a hostile reviewer, regulator, and skeptical veterinarian.

Your goal is to find every reason this product could fail:
- Scientifically
- Digestively
- Commercially
- Regulatory-wise

If this product should NOT be launched, explain exactly why.

Be ruthless. Be thorough. Don't hold back.`
  },
  {
    id: "vet-check",
    title: "Veterinarian Reality Check",
    description: "Would a vet recommend, tolerate, or warn against this?",
    icon: Stethoscope,
    prompt: `Analyze this formula strictly from a veterinarian's perspective.

Answer these questions honestly:
1. Would a vet recommend this product to clients?
2. Would they merely tolerate it if a client brought it up?
3. Would they actively warn against it?

Consider:
- Ingredient safety profiles
- Dosage appropriateness
- Potential drug interactions
- Evidence base for claims
- Risk of harm vs potential benefit

Explain your reasoning as a practicing veterinarian would.`
  },
  {
    id: "label-audit",
    title: "Label vs Reality Audit",
    description: "Compare marketing claims to actual delivery",
    icon: Eye,
    prompt: `Compare the marketing claims this formula could support versus what it will actually deliver.

For each potential claim:
1. What the label might say
2. What the science actually supports
3. Gap between expectation and reality

Identify where consumer disappointment is likely.
Identify where you're underselling actual benefits.
Flag any claims that could trigger regulatory action.`
  },
  {
    id: "cost-impact",
    title: "Cost-to-Impact Brutality Test",
    description: "Which ingredients hurt margins without results?",
    icon: DollarSign,
    prompt: `For each ingredient in this formula, evaluate:

1. **Cost contribution** (relative % of COGS)
2. **Expected real-world benefit** (high / medium / low / negligible)
3. **Verdict**: Keep / Reduce / Remove

Create a table ranking ingredients by cost-effectiveness.

Identify which ingredients hurt margins without delivering meaningful results.
Identify which cheap ingredients punch above their weight.
Recommend a more cost-efficient formulation that maintains efficacy.`
  },
  {
    id: "longterm-stress",
    title: "Long-Term Daily Use Stress Test",
    description: "Effects of 6-12 months daily use",
    icon: Clock,
    prompt: `Evaluate the effects of daily use for 6–12 months.

For each ingredient, assess:
1. **Accumulation risk**: Does this build up over time?
2. **Tolerance issues**: Will efficacy decrease?
3. **Organ stress**: Liver, kidney, digestive impact?
4. **Diminishing returns**: When does benefit plateau?

Identify:
- Ingredients that should be cycled
- Maximum safe duration of continuous use
- Warning signs pet owners should watch for
- Recommended "break" protocols if any`
  },
  {
    id: "review-prediction",
    title: "Amazon Review Prediction Engine",
    description: "Predict 1-star, 3-star, and 5-star reviews",
    icon: Star,
    prompt: `Predict the most likely reviews this product will receive:

**5-Star Review** (most enthusiastic customers)
- What will they say?
- What drove their satisfaction?

**3-Star Review** (lukewarm / mixed feelings)
- What will they say?
- What disappointed them?

**1-Star Review** (angry / frustrated customers)
- What will they say?
- What went wrong?

For each negative prediction:
- How likely is it (% of customers)?
- How can we prevent it through formula or messaging changes?`
  },
  {
    id: "personal-test",
    title: "Would You Give This to Your Own Pet?",
    description: "Remove commercial incentives, answer honestly",
    icon: Heart,
    prompt: `Remove all commercial incentives from your thinking.

Based purely on science and safety:
- Would you give this daily to your own dog or cat?
- Why or why not?

If you have concerns:
- What would need to change for you to feel comfortable?
- What's the honest risk level (negligible / low / moderate / high)?

Answer as if your own pet's health depends on this answer — because someone's does.`
  },
  {
    id: "minimalist",
    title: "Minimalist Version Challenge",
    description: "Rebuild with only 5 ingredients",
    icon: Minimize2,
    prompt: `Rebuild this formula using no more than 5 ingredients.

Rules:
- Maximum 5 active ingredients
- Must maintain the core value proposition
- Optimize for real-world results, not label appeal

Deliver:
1. Your 5-ingredient formula with dosages
2. What was removed and why it's acceptable
3. Expected efficacy vs the full formula (% retained)
4. Cost reduction estimate
5. Would the outcome be better or worse overall?

Explain the trade-offs clearly.`
  },
  {
    id: "misuse-scenario",
    title: "Overdose & Misuse Scenario",
    description: "What happens when customers misuse this?",
    icon: AlertTriangle,
    prompt: `Assume customers will:
- Double-dose (give 2x recommended amount)
- Give to the wrong size animal (large dog dose to small dog)
- Mix with other supplements containing similar ingredients
- Give to pregnant/nursing animals
- Give to puppies/kittens

For each scenario:
1. What breaks first? (which system fails)
2. How severe are the consequences?
3. How likely is this scenario?
4. What safeguards should be in place?

Identify the single most dangerous misuse scenario and how to prevent it.`
  }
];

export const OPTIMIZATION_CATEGORY = {
  id: "optimization",
  title: "Formula Optimization Review",
  description: "5-step comprehensive analysis",
  icon: FlaskConical
};

export const HARD_PROMPTS_CATEGORY = {
  id: "hard-prompts",
  title: "Hard Prompts (Critical Evaluations)",
  description: "Tough questions that save money, time, and reputation",
  icon: ShieldAlert
};

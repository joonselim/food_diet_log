/**
 * Add searchable aliases to USDA foods so common names map to scientific USDA descriptions.
 * e.g. "Cereals, oats, regular..." → aliases: ["oatmeal", "oat", "오트밀"]
 *
 * Run:  node scripts/import/aliases.js
 */

import { getDb, closeDb } from "../../src/db.js";

// Each rule: name regex → aliases to inject
// Aliases are searched with Atlas Search text/phrase, boosted separately.
const RULES = [
  // ── Grains / Cereals ───────────────────────────────────────────────────────
  {
    match: /^(cereals,?\s*)?oats[,\s]/i,
    aliases: ["oatmeal", "oat", "oats", "rolled oats", "instant oats", "quick oats", "오트밀", "귀리"],
  },
  {
    match: /^oats,\s*whole grain/i,
    aliases: ["oatmeal", "rolled oats", "steel cut oats", "오트밀", "귀리"],
  },
  {
    match: /^oat bran/i,
    aliases: ["oat bran", "오트브랜", "귀리겨"],
  },
  {
    match: /^rice,\s*brown/i,
    aliases: ["brown rice", "현미", "현미밥"],
  },
  {
    match: /^rice,\s*white/i,
    aliases: ["white rice", "rice", "쌀밥", "흰쌀", "쌀"],
  },
  {
    match: /^wild rice/i,
    aliases: ["wild rice", "야생쌀"],
  },
  {
    match: /pasta|spaghetti.*cooked|macaroni.*cooked/i,
    aliases: ["pasta", "spaghetti", "noodle", "파스타", "스파게티", "면"],
  },
  {
    match: /^bread,\s*whole.wheat/i,
    aliases: ["whole wheat bread", "wheat bread", "통밀빵", "통밀"],
  },
  {
    match: /^bread,\s*white/i,
    aliases: ["white bread", "bread", "식빵", "흰빵"],
  },
  {
    match: /^bread,\s*oatmeal/i,
    aliases: ["oatmeal bread", "오트밀빵"],
  },
  {
    match: /quinoa/i,
    aliases: ["quinoa", "퀴노아"],
  },
  {
    match: /barley.*cooked|barley.*raw/i,
    aliases: ["barley", "보리"],
  },

  // ── Proteins — Poultry ────────────────────────────────────────────────────
  {
    match: /^chicken,\s*(breast|broiler.*breast)/i,
    aliases: ["chicken breast", "chicken", "닭가슴살", "닭고기"],
  },
  {
    match: /^chicken,\s*thigh/i,
    aliases: ["chicken thigh", "닭다리", "닭허벅지살"],
  },
  {
    match: /^chicken,\s*drumstick/i,
    aliases: ["chicken drumstick", "chicken leg", "닭다리"],
  },
  {
    match: /^chicken,\s*wing/i,
    aliases: ["chicken wing", "닭날개"],
  },
  {
    match: /^turkey,?\s*breast/i,
    aliases: ["turkey breast", "터키가슴살"],
  },

  // ── Proteins — Beef ───────────────────────────────────────────────────────
  {
    match: /^beef,\s*ground/i,
    aliases: ["ground beef", "hamburger", "다진소고기", "소고기"],
  },
  {
    match: /^beef,\s*ribeye/i,
    aliases: ["ribeye", "ribeye steak", "립아이", "소고기"],
  },
  {
    match: /^beef,\s*(tenderloin|loin.*tenderloin)/i,
    aliases: ["beef tenderloin", "filet mignon", "안심", "소고기"],
  },
  {
    match: /^beef,\s*(short loin.*strip|short loin.*t-bone)/i,
    aliases: ["ny strip", "strip steak", "t-bone", "소고기"],
  },
  {
    match: /^beef,\s*round/i,
    aliases: ["beef round", "round steak", "소고기"],
  },
  {
    match: /^beef,\s*flank/i,
    aliases: ["flank steak", "beef flank", "소고기"],
  },
  {
    match: /^beef,\s*sirloin/i,
    aliases: ["sirloin", "sirloin steak", "등심", "소고기"],
  },

  // ── Proteins — Pork ───────────────────────────────────────────────────────
  {
    match: /^pork,\s*loin.*tenderloin/i,
    aliases: ["pork tenderloin", "돼지안심", "돼지고기"],
  },
  {
    match: /^pork,\s*loin/i,
    aliases: ["pork loin", "돼지등심", "돼지고기"],
  },
  {
    match: /^pork,\s*ground/i,
    aliases: ["ground pork", "다진돼지고기", "돼지고기"],
  },
  {
    match: /^pork,\s*belly/i,
    aliases: ["pork belly", "bacon", "삼겹살", "돼지고기"],
  },
  {
    match: /^pork,\s*chop/i,
    aliases: ["pork chop", "돼지갈비", "돼지고기"],
  },

  // ── Proteins — Fish & Seafood ─────────────────────────────────────────────
  {
    match: /^fish,\s*salmon/i,
    aliases: ["salmon", "연어"],
  },
  {
    match: /^fish,\s*tuna|^tuna,\s*ahi/i,
    aliases: ["tuna", "참치"],
  },
  {
    match: /^fish,\s*tuna.*canned/i,
    aliases: ["canned tuna", "tuna", "참치캔", "참치"],
  },
  {
    match: /^fish,\s*cod/i,
    aliases: ["cod", "대구"],
  },
  {
    match: /^fish,\s*tilapia/i,
    aliases: ["tilapia", "틸라피아"],
  },
  {
    match: /^fish,\s*mackerel/i,
    aliases: ["mackerel", "고등어"],
  },
  {
    match: /^shrimp|^crustaceans.*shrimp/i,
    aliases: ["shrimp", "prawn", "새우"],
  },

  // ── Eggs & Dairy ──────────────────────────────────────────────────────────
  {
    match: /^egg,?\s*whole.*raw(?!.*dried|.*pasteurized)/i,
    aliases: ["egg", "whole egg", "달걀", "계란"],
  },
  {
    match: /^egg,?\s*white.*raw/i,
    aliases: ["egg white", "계란흰자", "달걀흰자"],
  },
  {
    match: /^egg,?\s*yolk.*raw/i,
    aliases: ["egg yolk", "계란노른자", "달걀노른자"],
  },
  {
    match: /^milk,\s*whole/i,
    aliases: ["whole milk", "milk", "전유", "우유"],
  },
  {
    match: /^milk,\s*lowfat|^milk,\s*2%/i,
    aliases: ["lowfat milk", "2% milk", "저지방우유", "우유"],
  },
  {
    match: /^milk,\s*skim|^milk,\s*nonfat/i,
    aliases: ["skim milk", "nonfat milk", "무지방우유", "우유"],
  },
  {
    match: /^yogurt,\s*greek.*plain/i,
    aliases: ["greek yogurt", "plain greek yogurt", "그릭요거트", "요거트"],
  },
  {
    match: /^yogurt,\s*plain/i,
    aliases: ["yogurt", "plain yogurt", "요거트"],
  },
  {
    match: /^cheese,\s*cheddar/i,
    aliases: ["cheddar", "cheddar cheese", "체다치즈", "치즈"],
  },
  {
    match: /^cheese,\s*mozzarella/i,
    aliases: ["mozzarella", "모짜렐라", "치즈"],
  },
  {
    match: /^cheese,\s*cottage/i,
    aliases: ["cottage cheese", "코티지치즈"],
  },
  {
    match: /^cheese,\s*feta/i,
    aliases: ["feta", "feta cheese", "페타치즈"],
  },
  {
    match: /^cheese,\s*parmesan/i,
    aliases: ["parmesan", "파마산", "파르메산"],
  },
  {
    match: /^cheese,\s*ricotta/i,
    aliases: ["ricotta", "리코타"],
  },
  {
    match: /^butter(?!milk)/i,
    aliases: ["butter", "버터"],
  },
  {
    match: /^buttermilk/i,
    aliases: ["buttermilk", "버터밀크"],
  },

  // ── Nuts & Seeds ─────────────────────────────────────────────────────────
  {
    match: /^nuts,\s*almonds/i,
    aliases: ["almond", "almonds", "아몬드"],
  },
  {
    match: /^nuts,\s*walnuts/i,
    aliases: ["walnut", "walnuts", "호두"],
  },
  {
    match: /^nuts,\s*cashews/i,
    aliases: ["cashew", "cashews", "캐슈넛"],
  },
  {
    match: /^nuts,\s*pistachio/i,
    aliases: ["pistachio", "피스타치오"],
  },
  {
    match: /^nuts,\s*macadamia/i,
    aliases: ["macadamia", "마카다미아"],
  },
  {
    match: /^nuts,\s*brazil/i,
    aliases: ["brazil nut", "브라질너트"],
  },
  {
    match: /^nuts,\s*pecans/i,
    aliases: ["pecan", "피칸"],
  },
  {
    match: /^nuts,\s*hazelnuts/i,
    aliases: ["hazelnut", "헤이즐넛"],
  },
  {
    match: /^peanut butter/i,
    aliases: ["peanut butter", "땅콩버터"],
  },
  {
    match: /^peanuts/i,
    aliases: ["peanut", "땅콩"],
  },
  {
    match: /^seeds,\s*chia/i,
    aliases: ["chia seed", "chia", "치아씨드"],
  },
  {
    match: /^seeds,\s*flaxseed|^flaxseed/i,
    aliases: ["flaxseed", "flax", "아마씨"],
  },
  {
    match: /^seeds,\s*sunflower/i,
    aliases: ["sunflower seed", "해바라기씨"],
  },
  {
    match: /^seeds,\s*pumpkin/i,
    aliases: ["pumpkin seed", "호박씨"],
  },
  {
    match: /^seeds,\s*sesame/i,
    aliases: ["sesame seed", "참깨"],
  },

  // ── Vegetables ───────────────────────────────────────────────────────────
  {
    match: /^broccoli/i,
    aliases: ["broccoli", "브로콜리"],
  },
  {
    match: /^spinach/i,
    aliases: ["spinach", "시금치"],
  },
  {
    match: /^kale/i,
    aliases: ["kale", "케일"],
  },
  {
    match: /^lettuce/i,
    aliases: ["lettuce", "상추"],
  },
  {
    match: /^carrots/i,
    aliases: ["carrot", "당근"],
  },
  {
    match: /^sweet potato/i,
    aliases: ["sweet potato", "yam", "고구마"],
  },
  {
    match: /^potatoes.*baked|^potatoes.*boiled|^potatoes.*raw/i,
    aliases: ["potato", "baked potato", "감자"],
  },
  {
    match: /^tomato/i,
    aliases: ["tomato", "토마토"],
  },
  {
    match: /^cucumber/i,
    aliases: ["cucumber", "오이"],
  },
  {
    match: /^peppers,\s*bell/i,
    aliases: ["bell pepper", "pepper", "파프리카", "피망"],
  },
  {
    match: /^onions/i,
    aliases: ["onion", "양파"],
  },
  {
    match: /^garlic/i,
    aliases: ["garlic", "마늘"],
  },
  {
    match: /^eggplant/i,
    aliases: ["eggplant", "aubergine", "가지"],
  },
  {
    match: /^squash,\s*winter.*butternut/i,
    aliases: ["butternut squash", "호박"],
  },
  {
    match: /^mushrooms?,\s*white button/i,
    aliases: ["mushroom", "button mushroom", "버섯"],
  },
  {
    match: /^asparagus/i,
    aliases: ["asparagus", "아스파라거스"],
  },
  {
    match: /^celery/i,
    aliases: ["celery", "셀러리"],
  },
  {
    match: /^corn|^sweet corn/i,
    aliases: ["corn", "sweet corn", "옥수수"],
  },
  {
    match: /^peas/i,
    aliases: ["peas", "완두콩"],
  },
  {
    match: /^edamame/i,
    aliases: ["edamame", "에다마메", "풋콩"],
  },
  {
    match: /^soybeans/i,
    aliases: ["soybean", "edamame", "대두", "콩"],
  },

  // ── Fruits ───────────────────────────────────────────────────────────────
  {
    match: /^bananas/i,
    aliases: ["banana", "바나나"],
  },
  {
    match: /^apples/i,
    aliases: ["apple", "사과"],
  },
  {
    match: /^oranges/i,
    aliases: ["orange", "오렌지"],
  },
  {
    match: /^strawberries/i,
    aliases: ["strawberry", "딸기"],
  },
  {
    match: /^blueberries/i,
    aliases: ["blueberry", "블루베리"],
  },
  {
    match: /^raspberries/i,
    aliases: ["raspberry", "라즈베리"],
  },
  {
    match: /^avocados/i,
    aliases: ["avocado", "아보카도"],
  },
  {
    match: /^grapes/i,
    aliases: ["grape", "포도"],
  },
  {
    match: /^mango/i,
    aliases: ["mango", "망고"],
  },
  {
    match: /^pineapple/i,
    aliases: ["pineapple", "파인애플"],
  },
  {
    match: /^watermelon/i,
    aliases: ["watermelon", "수박"],
  },
  {
    match: /^peaches/i,
    aliases: ["peach", "복숭아"],
  },
  {
    match: /^pears/i,
    aliases: ["pear", "배"],
  },
  {
    match: /^cherries/i,
    aliases: ["cherry", "체리"],
  },
  {
    match: /^kiwi/i,
    aliases: ["kiwi", "키위"],
  },

  // ── Fats & Oils ───────────────────────────────────────────────────────────
  {
    match: /^oil,\s*olive/i,
    aliases: ["olive oil", "올리브유", "올리브오일"],
  },
  {
    match: /^oil,\s*coconut/i,
    aliases: ["coconut oil", "코코넛오일"],
  },
  {
    match: /^oil,\s*avocado/i,
    aliases: ["avocado oil", "아보카도오일"],
  },
  {
    match: /^oil,\s*vegetable/i,
    aliases: ["vegetable oil", "식용유"],
  },
  {
    match: /^sesame butter|^tahini/i,
    aliases: ["tahini", "sesame paste", "참깨페이스트"],
  },

  // ── Legumes ───────────────────────────────────────────────────────────────
  {
    match: /^lentils/i,
    aliases: ["lentil", "렌틸콩"],
  },
  {
    match: /^chickpeas|^beans.*garbanzo/i,
    aliases: ["chickpea", "garbanzo", "병아리콩"],
  },
  {
    match: /^beans.*black/i,
    aliases: ["black bean", "블랙빈", "검은콩"],
  },
  {
    match: /^beans.*kidney/i,
    aliases: ["kidney bean", "강낭콩"],
  },
  {
    match: /^tofu/i,
    aliases: ["tofu", "두부"],
  },

  // ── Beverages ─────────────────────────────────────────────────────────────
  {
    match: /^soy milk/i,
    aliases: ["soy milk", "soymilk", "두유"],
  },
  {
    match: /^almond milk/i,
    aliases: ["almond milk", "아몬드우유"],
  },
  {
    match: /^oat milk/i,
    aliases: ["oat milk", "귀리우유"],
  },
];

async function main() {
  const db = await getDb();
  const col = db.collection("foods");

  let updated = 0;
  let skipped = 0;

  for (const rule of RULES) {
    // Only apply to Foundation and SR Legacy — branded foods search fine by name
    const docs = await col.find(
      { source: { $in: ["usda_foundation", "usda_sr"] }, name: { $regex: rule.match.source, $options: "i" } },
      { projection: { _id: 1, name: 1, aliases: 1 } }
    ).toArray();

    for (const doc of docs) {
      const existing = new Set(doc.aliases ?? []);
      const toAdd = rule.aliases.filter((a) => !existing.has(a));
      if (toAdd.length === 0) { skipped++; continue; }

      await col.updateOne(
        { _id: doc._id },
        { $addToSet: { aliases: { $each: toAdd } } }
      );
      updated++;
    }
  }

  console.log(`Done — documents updated: ${updated}, already up-to-date: ${skipped}`);
  await closeDb();
}

main().catch((e) => { console.error(e); process.exit(1); });

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Check,
  CheckCircle2,
  Code2,
  Copy,
  Download,
  Eye,
  FileJson2,
  FlaskConical,
  ImagePlus,
  LogIn,
  LogOut,
  Plus,
  RotateCcw,
  Save,
  ShieldCheck,
  Sparkles,
  Trash2,
  TriangleAlert,
  Upload,
  X,
} from "lucide-react";
import { isSupabaseConfigured, supabase } from "../lib/supabase";
import { getPublicConfig, saveConfig } from "../lib/catalog";
import seedConfig from "../data/seed.json";
import CardImage from "../components/CardImage";
import RunningStyleLogo from "../components/RunningStyleLogo";
import { findMatchingScenario, getScenarioRecommendations, makeEmptyConditions, makeEmptyRecommendations, RECOMMENDATION_CATEGORIES, RUNNING_STYLES, validateConfig } from "../lib/scenarioEngine";

const CORE_ORDER = ["kitasan-black", "super-creek", "fine-motion", "agnes-tachyon", "maruzensky", "mr-cb"];
const CORE_LABELS = {
  "kitasan-black": "Kitasan Black",
  "super-creek": "Super Creek",
  "fine-motion": "Fine Motion",
  "agnes-tachyon": "Agnes Tachyon",
  maruzensky: "Maruzensky",
  "mr-cb": "Mr. C.B.",
};
const LB_CHOICES = [
  { value: "any", label: "Ignore / any level" },
  { value: "-1", label: "Not owned" },
  { value: "0", label: "LB0" },
  { value: "1", label: "LB1" },
  { value: "2", label: "LB2" },
  { value: "3", label: "LB3" },
  { value: "4", label: "LB4" },
];
function sortCoreCards(cards) {
  const rank = new Map(CORE_ORDER.map((id, index) => [id, index]));
  return [...cards].filter((card) => card.isCore).sort((a, b) => (rank.get(a.id) ?? 99) - (rank.get(b.id) ?? 99));
}

function makeId(prefix = "item") {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function ensureConfig(value) {
  const source = value && typeof value === "object" ? value : seedConfig;
  const rawOldCards = Array.isArray(source.cards) ? source.cards : [];
  const oldCards = rawOldCards
    .map((card) => {
      if (!card || typeof card !== "object") return card;
      const imageId = String(card.gameCardId || card.imageUrl?.match(/\/(\d+)\.png(?:\?.*)?$/)?.[1] || "");
      const sameGameCard = seedConfig.cards.find((defaultCard) => String(defaultCard.gameCardId || defaultCard.imageUrl?.match(/\/(\d+)\.png(?:\?.*)?$/)?.[1] || "") === imageId && imageId);
      if (!sameGameCard || String(card.id) === String(sameGameCard.id)) return card;
      return { ...sameGameCard, ...card, id: sameGameCard.id, gameCardId: imageId };
    })
    .filter(Boolean);
  const byId = new Map(oldCards.map((card) => [String(card.id), card]));
  const defaults = [
    ...seedConfig.cards.filter((card) => card.isCore).map((card) => ({ ...card, ...(byId.get(String(card.id)) || {}), isCore: true })),
    ...seedConfig.cards.filter((card) => !card.isCore).map((card) => ({ ...card, ...(byId.get(String(card.id)) || {}), isCore: false })),
  ];
  const cards = [...defaults];
  oldCards.forEach((card) => {
    if (!cards.some((existing) => String(existing.id) === String(card.id))) cards.push({ ...card, isCore: false });
  });
  return {
    ...seedConfig,
    ...source,
    cards,
    scenarios: Array.isArray(source.scenarios)
      ? source.scenarios.map((scenario) => ({
          ...scenario,
          conditions: scenario.conditions && typeof scenario.conditions === "object" ? scenario.conditions : {},
          recommendations: { ...makeEmptyRecommendations(), ...(scenario.recommendations || {}) },
          enabled: scenario.enabled !== false,
          priority: Number(scenario.priority || 0),
        }))
      : [],
  };
}

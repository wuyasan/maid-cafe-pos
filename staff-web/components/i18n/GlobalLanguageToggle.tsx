"use client";

import { useEffect, useState } from "react";

type Language = "en" | "zh";

const STORAGE_KEY = "maid-cafe-pos:language";

const exactTranslations: Record<string, string> = {
  "Main Dashboard": "主控制台",
  "Switch View": "切换页面",
  "Square Settings": "Square 设置",
  "Admin": "管理后台",
  "Floor": "巡台",
  "Front": "前台",
  "Kitchen": "后厨",
  "Bar": "水吧",
  "Runner": "取餐",
  "Staff Order": "女仆点单",
  "Table Selection": "选择桌位",
  "Back to Floor": "返回巡台",
  "Back": "返回",
  "Cancel": "取消",
  "Save": "保存",
  "Saving...": "保存中...",
  "Create": "创建",
  "Update": "更新",
  "Edit": "编辑",
  "Delete": "删除",
  "Delete Item": "删除此项",
  "Delete All": "全部删除",
  "Remove": "移除",
  "Active": "启用",
  "Inactive": "停用",
  "Name": "名称",
  "Description": "描述",
  "Price": "价格",
  "Sale Price": "售价",
  "Image URL": "图片网址",
  "Photo URL": "照片网址",
  "Choose from device": "从本机选择",
  "Uploading...": "上传中...",
  "Remove image": "移除图片",
  "Remove photo": "移除照片",
  "Menu Items": "菜单商品",
  "Menu Item": "菜单商品",
  "Add Menu Item": "添加菜单商品",
  "Edit Menu Item": "编辑菜单商品",
  "Create Menu Item": "创建菜单商品",
  "Update Menu Item": "更新菜单商品",
  "Item Type": "商品类型",
  "Regular": "普通商品",
  "Maid Service": "女仆服务",
  "Category": "分类",
  "No category": "无分类",
  "Combo Components": "套餐组成",
  "Add Component": "添加组成商品",
  "This item is a combo / bundle": "这是套餐商品",
  "Maid Service Pricing": "女仆服务价格",
  "Additional Maid Price": "额外女仆价格",
  "All Maids Price": "全体女仆价格",
  "Maids": "女仆",
  "Add Maid": "添加女仆",
  "Edit Maid": "编辑女仆",
  "Create Maid": "创建女仆",
  "Update Maid": "更新女仆",
  "Bio": "简介",
  "Display Order": "显示顺序",
  "Sessions": "场次",
  "Tables": "桌位",
  "Session Tables": "场次桌位",
  "Session Maids": "场次女仆",
  "Categories": "分类",
  "Table Layout": "桌位布局",
  "Current Session": "当前场次",
  "No active session": "没有启用中的场次",
  "Menu": "菜单",
  "All": "全部",
  "Add to Cart": "加入购物车",
  "Ordering Closed": "停止接单",
  "Cart": "购物车",
  "Current Bill": "当前账单",
  "Bill Items": "账单项目",
  "Checkout": "结账",
  "Subtotal": "小计",
  "Tax": "税",
  "Service": "服务费",
  "Total": "总计",
  "Submit Order": "提交订单",
  "Submitting...": "提交中...",
  "No submitted items yet.": "还没有已提交的商品。",
  "No items yet.": "还没有商品。",
  "Loading...": "加载中...",
  "Loading bill...": "正在加载账单...",
  "Loading pickup orders...": "正在加载取餐订单...",
  "Pay with iPad Square Reader": "使用 iPad Square Reader 收款",
  "Opening Square...": "正在打开 Square...",
  "Square Paid · Mark Bill Paid": "Square 已收款 · 标记账单已支付",
  "START PREPARING": "开始制作",
  "MARK COMPLETED": "标记完成",
  "Back to Waiting": "退回等待",
  "Reopen Item": "重新打开",
  "WAITING": "等待中",
  "PREPARING": "制作中",
  "COMPLETED": "已完成",
  "READY FOR PICKUP": "可以取餐",
  "Picked Up": "已取餐",
  "Check Before Pickup": "检查后取餐",
  "No orders waiting for pickup.": "没有等待取餐的订单。",
  "Enable sound": "开启声音",
  "Enable alerts": "开启提醒",
  "Select all maids": "选择全部女仆",
  "Clear all": "清除全部",
  "Confirm Maid": "确认女仆",
  "Maid selection": "选择女仆",
};

const regexTranslations: Array<[RegExp, (...values: string[]) => string]> = [
  [/^Table (.+)$/, (table) => `桌位 ${table}`],
  [/^Current Session: (.+)$/, (session) => `当前场次：${session}`],
  [/^Qty (\d+)$/, (quantity) => `数量 ${quantity}`],
  [/^(\d+) item\(s\)$/, (quantity) => `${quantity} 项`],
  [/^Cart · (\d+)$/, (quantity) => `购物车 · ${quantity}`],
  [/^Order #(\d+)$/, (order) => `订单 #${order}`],
];

const originalText = new WeakMap<Text, string>();
const originalAttributes = new WeakMap<Element, Record<string, string>>();

function translateValue(value: string): string {
  const leading = value.match(/^\s*/)?.[0] ?? "";
  const trailing = value.match(/\s*$/)?.[0] ?? "";
  const trimmed = value.trim();

  if (!trimmed) return value;

  const exact = exactTranslations[trimmed];
  if (exact) return `${leading}${exact}${trailing}`;

  for (const [pattern, formatter] of regexTranslations) {
    const match = trimmed.match(pattern);
    if (match) {
      return `${leading}${formatter(...match.slice(1))}${trailing}`;
    }
  }

  return value;
}

function applyLanguage(language: Language, root: ParentNode = document) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let current = walker.nextNode() as Text | null;

  while (current) {
    const parent = current.parentElement;
    const skip =
      !parent ||
      ["SCRIPT", "STYLE", "NOSCRIPT", "CODE", "PRE"].includes(parent.tagName);

    if (!skip) {
      if (!originalText.has(current)) {
        originalText.set(current, current.nodeValue ?? "");
      }

      const original = originalText.get(current) ?? "";
      current.nodeValue =
        language === "zh" ? translateValue(original) : original;
    }

    current = walker.nextNode() as Text | null;
  }

  const elements =
    root instanceof Element
      ? [root, ...Array.from(root.querySelectorAll("*"))]
      : Array.from(root.querySelectorAll("*"));

  for (const element of elements) {
    const values = originalAttributes.get(element) ?? {};

    for (const attribute of ["placeholder", "title", "aria-label"]) {
      if (element.hasAttribute(attribute) && values[attribute] == null) {
        values[attribute] = element.getAttribute(attribute) ?? "";
      }

      if (values[attribute] != null) {
        element.setAttribute(
          attribute,
          language === "zh"
            ? translateValue(values[attribute])
            : values[attribute],
        );
      }
    }

    originalAttributes.set(element, values);
  }
}

export default function GlobalLanguageToggle() {
  const [language, setLanguage] = useState<Language>("en");

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    setLanguage(stored === "zh" ? "zh" : "en");
  }, []);

  useEffect(() => {
    document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
    window.localStorage.setItem(STORAGE_KEY, language);
    applyLanguage(language);

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of Array.from(mutation.addedNodes)) {
          if (node instanceof Element) {
            applyLanguage(language, node);
          } else if (node instanceof Text && node.parentNode) {
            applyLanguage(language, node.parentNode);
          }
        }
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [language]);

  return (
    <button
      type="button"
      onClick={() =>
        setLanguage((current) => (current === "en" ? "zh" : "en"))
      }
      style={{
        position: "fixed",
        top: "calc(12px + env(safe-area-inset-top))",
        right: 12,
        zIndex: 10000,
        minHeight: 40,
        padding: "8px 13px",
        borderRadius: 999,
        border: "1px solid rgba(148,163,184,.7)",
        background: "rgba(255,255,255,.94)",
        color: "#111827",
        boxShadow: "0 8px 24px rgba(15,23,42,.16)",
        fontWeight: 900,
        backdropFilter: "blur(10px)",
      }}
      aria-label="Switch language"
      title="Switch language"
    >
      {language === "en" ? "中文" : "English"}
    </button>
  );
}

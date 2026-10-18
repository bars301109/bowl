import { pgTable, serial, text, integer, boolean } from "drizzle-orm/pg-core";

// Categories table
export const categories = pgTable("categories", {
  id: serial("id").primaryKey(),
  name_ru: text("name_ru").notNull(),
  name_ky: text("name_ky").notNull(),
  desc_ru: text("desc_ru").default(""),
  desc_ky: text("desc_ky").default(""),
  created_at: text("created_at"),
});

// Teams table
export const teams = pgTable("teams", {
  id: serial("id").primaryKey(),
  team_name: text("team_name"),
  login: text("login"),
  password: text("password"),
  team_email: text("team_email"),
  email: text("email"),
  phone: text("phone"),
  members: text("members"),
  school: text("school"),
  city: text("city"),
  category_id: integer("category_id"),
  invite_code: text("invite_code"),
  status: text("status").default("forming"),
  created_at: text("created_at"),
});

// Participants table
export const participants = pgTable("participants", {
  id: serial("id").primaryKey(),
  full_name: text("full_name").notNull(),
  email: text("email").notNull(),
  password_hash: text("password_hash").notNull(),
  phone: text("phone"),
  grade: text("grade"),
  school: text("school"),
  city: text("city"),
  team_id: integer("team_id").references(() => teams.id, { onDelete: "set null" }),
  category_id: integer("category_id").references(() => categories.id, { onDelete: "set null" }),
  category_confirmed: boolean("category_confirmed").default(false),
  created_at: text("created_at"),
});

// Uploaded files table
export const uploadedFiles = pgTable("uploaded_files", {
  id: serial("id").primaryKey(),
  filename: text("filename").notNull(),
  mime_type: text("mime_type").notNull(),
  data_base64: text("data_base64").notNull(),
  size_bytes: integer("size_bytes"),
  created_at: text("created_at"),
});

// Tests table
export const tests = pgTable("tests", {
  id: serial("id").primaryKey(),
  title: text("title"),
  description: text("description"),
  preview_text: text("preview_text"),
  lang: text("lang").default("ru"),
  duration_minutes: integer("duration_minutes").default(60),
  window_start: text("window_start"),
  window_end: text("window_end"),
  status: text("status").default("draft"),
  category_id: integer("category_id"),
  created_at: text("created_at"),
});

// Questions table
export const questions = pgTable("questions", {
  id: serial("id").primaryKey(),
  test_id: integer("test_id").references(() => tests.id, { onDelete: "cascade" }),
  ordinal: integer("ordinal"),
  text: text("text"),
  options: text("options"),
  correct: text("correct"),
  points: integer("points").default(1),
  lang: text("lang").default("ru"),
  type: text("type").default("mcq"),
  attachment_url: text("attachment_url"),
  category_id: integer("category_id"),
});

// Results table
export const results = pgTable("results", {
  id: serial("id").primaryKey(),
  team_id: integer("team_id").references(() => teams.id, { onDelete: "cascade" }),
  test_id: integer("test_id").references(() => tests.id, { onDelete: "cascade" }),
  participant_id: integer("participant_id"),
  category_id: integer("category_id"),
  score: integer("score"),
  answers: text("answers"),
  taken_at: text("taken_at"),
  started_at: text("started_at"),
  time_taken_sec: integer("time_taken_sec"),
});

// Test sessions table
export const testSessions = pgTable("test_sessions", {
  id: serial("id").primaryKey(),
  team_id: integer("team_id").references(() => teams.id, { onDelete: "cascade" }),
  test_id: integer("test_id").references(() => tests.id, { onDelete: "cascade" }),
  started_at: text("started_at"),
  status: text("status").default("in_progress"),
  expires_at: text("expires_at"),
});

// Settings table
export const settings = pgTable("settings", {
  id: integer("id").primaryKey(),
  day1_date: text("day1_date"),
  day2_date: text("day2_date"),
  day3_date: text("day3_date"),
  final_place_ru: text("final_place_ru"),
  final_place_ky: text("final_place_ky"),
  results_published: integer("results_published").default(0),
  one_submission_allowed: integer("one_submission_allowed").default(0),
  updated_at: text("updated_at"),
});

// Password reset codes table
export const passwordResetCodes = pgTable("password_reset_codes", {
  id: serial("id").primaryKey(),
  email: text("email"),
  code: text("code"),
  expires_at: text("expires_at"),
  used: integer("used").default(0),
  created_at: text("created_at"),
});

// Homepage blocks table
export const homepageBlocks = pgTable("homepage_blocks", {
  id: serial("id").primaryKey(),
  block_key: text("block_key").unique("homepage_blocks_block_key_key"),
  badge_en: text("badge_en").default(""),
  badge_ky: text("badge_ky").default(""),
  badge_ru: text("badge_ru").default(""),
  title_en: text("title_en").default(""),
  title_ky: text("title_ky").default(""),
  title_ru: text("title_ru").default(""),
  content_en: text("content_en").default(""),
  content_ky: text("content_ky").default(""),
  content_ru: text("content_ru").default(""),
  updated_at: text("updated_at"),
});

// Announcements table
export const announcements = pgTable("announcements", {
  id: serial("id").primaryKey(),
  title_ru: text("title_ru").default(""),
  title_ky: text("title_ky").default(""),
  title_en: text("title_en").default(""),
  content_ru: text("content_ru").default(""),
  content_ky: text("content_ky").default(""),
  content_en: text("content_en").default(""),
  target_type: text("target_type").default("all"),
  target_category_id: integer("target_category_id").references(() => categories.id, { onDelete: "set null" }),
  priority: text("priority").default("normal"),
  is_published: integer("is_published").default(1),
  created_at: text("created_at"),
  updated_at: text("updated_at"),
});

// Support tickets table
export const supportTickets = pgTable("support_tickets", {
  id: serial("id").primaryKey(),
  team_id: integer("team_id").references(() => teams.id, { onDelete: "cascade" }),
  subject: text("subject").notNull(),
  category: text("category").default("general"),
  status: text("status").default("open"),
  created_at: text("created_at"),
  updated_at: text("updated_at"),
});

// Support messages table
export const supportMessages = pgTable("support_messages", {
  id: serial("id").primaryKey(),
  ticket_id: integer("ticket_id").references(() => supportTickets.id, { onDelete: "cascade" }),
  sender_type: text("sender_type").notNull(),
  sender_name: text("sender_name"),
  message: text("message").notNull(),
  created_at: text("created_at"),
});
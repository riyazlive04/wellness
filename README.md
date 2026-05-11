🌿 Sheizen Wellness Platform

Sheizen Wellness is a comprehensive, full-stack health and nutrition management platform bridging the gap between Admins (Nutritionists) and Clients. The platform facilitates personalized health journeys through real-time tracking, AI-assisted assessments, and community engagement.

🚀 Key Features

👤 Authentication & Role Management

Secure Auth: Powered by Supabase Auth with secure role-based access control (Admin vs. Client).

Smart Session Management: Auto-redirects based on user role and features a 15-minute inactivity timeout with cross-tab persistence.

📊 Dynamic Dashboards

Client View: Real-time logging for Calories, Meals (with photo uploads), Water, Activity, and Weight.

Activity Tracking: Specific categories for Aerobic, Muscle Strength, Flexibility, Stretch, and Lifestyle.

Instant Updates: Dashboards update immediately upon logging with full data persistence.

Admin View: Centralized hub to onboard/manage clients, review assessments, and manage platform content.

🧠 Assessments & AI Insights

Health Tracking: Standardized assessments for Sleep, Stress, and general Health.

Reporting: Admins review AI-generated insights and send formatted reports directly to clients.

Pending Queue: Dedicated "Pending Review" section for new assessments.

💬 Messaging & Community

Real-time Chat: WhatsApp-style messaging between Admin and Client with auto-scroll and unread counts.

Social Feed: Persistent community feed and group posts with persistent storage.

Engagement: Support for Likes, Comments, Hashtags, and Role Labels (Admin/Client).

Safety: Custom confirmation popups for post deletion.

🍽️ Nutrition & Content

Meal Management: Supabase Storage integration for meal photos and recipe uploads.

Recipe Builder: Detailed support for ingredients, instructions, and video URLs.

Urgent Approval: Feature for clients to request immediate food approval from their nutritionist.

🏆 Gamification

Achievements: Duolingo-style progression system using custom imagery and progress-based unlocks.

🛠️ Tech Stack

Frontend: React + TypeScript

Backend/BaaS: Supabase (Auth, PostgreSQL, Storage, Edge Functions)

Styling: Tailwind CSS

State Management: React Hooks

Real-time: Supabase Realtime Engine

🔐 Security & Persistence

Row Level Security (RLS): Strict Supabase RLS policies for all INSERT/SELECT/DELETE actions.

Data Integrity: No data loss on refresh; all timestamps utilize local time synchronization.

Environment Safety: All API keys managed via .env with no exposure of secret keys on the client side.
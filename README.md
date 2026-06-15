# Selkop Operations Bot

## Executive Summary
Selkop Operations Bot is a centralized, automated task management system built entirely on top of Telegram and Supabase. Designed for multi-branch environments, it transforms manual operational checklists into a trackable, real-time digital workflow. 

By utilizing Telegram as the front-end, it eliminates the need for staff to download or learn a new proprietary app, dramatically reducing friction and ensuring high compliance in daily operational reporting (e.g., cleaning, opening/closing duties, area checks).

## The Business Value

1. **Real-Time Operational Visibility:** Area managers and executives no longer need to rely on end-of-day verbal reports. With a single command (`/monitor`), leadership can see exactly who is working, what tasks have been completed, and what is currently pending across all branches.
2. **Accountability via Proof-of-Work:** Tasks cannot be blindly checked off. Staff are required to upload photographic evidence directly through the chat to officially mark a routine or ad-hoc task as completed.
3. **Automated Delegation:** The system utilizes automated database schedulers (`pg_cron`) to dispatch routine daily tasks to the correct branches at the correct times, freeing managers from micromanagement.
4. **Data-Driven Performance Tracking:** Historical data is preserved indefinitely. Managers can pull specific date-range reports (`/recap`) to audit branch performance, identify recurring bottlenecks, and generate downloadable CSV reports.

## Core Features
* **Role-Based Access Control (RBAC):** Strict operational boundaries between `staff` (task execution) and `pic` (Person In Charge / Management).
* **Multi-Tiered Management Layers:** 
  * **Branch Managers:** Monitor and assign tasks specifically within their local outlet.
  * **Area Managers (`GLOBAL`):** Monitor all branches collectively.
  * **Silent Executives (`EMPTY`):** Retain full system access and monitoring capabilities, but are intentionally shielded from continuous photo upload notifications to prevent alert fatigue.
* **Ad-Hoc Tasking:** Managers can dispatch sudden tasks (`/addtask`) directly to specific employees in real-time, completely within the chat interface.
* **Google Sheets Integration:** Automatically syncs completed task data and photo URLs into a live spreadsheet for HR, performance review, and payroll analysis.

## Technical Architecture
* **Frontend:** Telegram Bot API (Zero-install, highly accessible for end-users).
* **Backend:** Supabase Edge Functions (Deno) for infinitely scalable, serverless execution.
* **Database:** PostgreSQL with relational mapping (`Users` -> `Tasks`).
* **Automation:** Database-level Cron scheduling for zero-touch daily pipeline resets.

---<img width="1920" height="917" alt="image" src="https://github.com/user-attachments/assets/611a6e22-3d2c-421a-a16c-0b2230af86c8" />

*Built to streamline operations, enforce accountability, and provide executives with a crystal-clear view of their business from anywhere in the world.*

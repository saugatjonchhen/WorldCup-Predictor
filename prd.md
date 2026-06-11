# Product Requirements Document (PRD)

## Project Name

World Cup Predictor

## Overview

World Cup Predictor is a web application that allows users to predict FIFA World Cup match outcomes, compete with friends in private pools, and track rankings throughout the tournament.

The platform automatically calculates points based on actual match results and displays live leaderboards.

---

# Problem Statement

Fans enjoy predicting match results during major tournaments, but managing predictions and scoring manually in spreadsheets becomes difficult as the number of matches increases.

The application provides:

* Easy prediction entry
* Automated scoring
* Real-time rankings
* Private and public leagues
* Tournament engagement throughout the World Cup

---

# Goals

### Business Goals

* Increase user engagement during tournaments
* Support thousands of concurrent users
* Create viral sharing opportunities through private leagues

### User Goals

* Predict match results
* Compete with friends
* View rankings instantly
* Track prediction accuracy

---

# Target Users

### Casual Fans

Want simple predictions and a leaderboard.

### Football Enthusiasts

Want detailed statistics and prediction history.

### Office/Friend Groups

Need private pools and automated scoring.

---

# MVP Scope

## Authentication

### Features

* Email Login
* Google Login
* Password Reset
* Profile Management

### User Profile

* Name
* Username
* Avatar
* Country

---

## Tournament Selection

### Features

* Active Tournament List
* Tournament Details
* Match Schedule

Example:

* FIFA World Cup 2026
* UEFA Euro
* Copa America

---

## Match Predictions

### Features

Predict:

* Home Team Score
* Away Team Score

Example:

Argentina 2 - 1 Brazil

### Rules

Predictions lock:

* At kickoff time

After lock:

* Cannot edit

---

## Pools (Leagues)

### Create Pool

Fields:

* Pool Name
* Description
* Private/Public
* Invite Code

### Join Pool

Methods:

* Invite Link
* Invite Code

### Pool Settings

Admin can:

* Edit pool
* Remove users
* Close pool

---

## Scoring System

### Match Predictions

| Prediction              | Points |
| ----------------------- | ------ |
| Correct Result          | 3      |
| Correct Goal Difference | 2      |
| Exact Score             | 5      |

Examples:

Prediction: 2-1

Actual: 2-1

Points:

* Result = 3
* Goal Difference = 2
* Exact Score = 5

Total = 10

---

### Knockout Matches

Additional Points:

Correct Team Advancing:

+2 points

Example:

Prediction:

France 1-1 Argentina

Argentina Advances

Actual:

1-1

Argentina Wins Penalties

Award:

* Score points
* Advancement points

---

## Leaderboard

### Global Leaderboard

Shows:

* Rank
* Username
* Total Points

### Pool Leaderboard

Shows:

* Pool Rank
* Weekly Rank
* Total Points

---

## Results & Scoring Engine

Admin system updates:

* Match results
* Extra time results
* Penalty shootout results

System automatically:

* Calculates scores
* Updates rankings

---

# User Stories

## Authentication

As a user,
I want to sign up,
So that I can participate in prediction pools.

---

## Prediction

As a user,
I want to predict match scores,
So that I can earn points.

---

## Pool Creation

As a user,
I want to create a private pool,
So that I can compete with friends.

---

## Rankings

As a user,
I want to view rankings,
So that I can see my position.

---

# Screens

## Public

* Landing Page
* Login
* Register
* Forgot Password

## Authenticated

### Dashboard

Displays:

* Upcoming Matches
* My Predictions
* Current Rank

### Match Detail

Displays:

* Teams
* Kickoff Time
* Prediction Form

### Pools

Displays:

* My Pools
* Create Pool
* Join Pool

### Leaderboard

Displays:

* Rankings
* Points
* Prediction Accuracy

### Profile

Displays:

* Avatar
* Stats
* History

---

# Advanced Features (Phase 2)

## Tournament Predictions

Predict before tournament:

* Winner
* Runner-up
* Golden Boot
* Golden Glove

Bonus Points:

* Winner = 20
* Runner-up = 10
* Golden Boot = 10

---

## Statistics

Show:

* Prediction Accuracy %
* Most Predicted Team
* Best Performing Predictor

---

## Notifications

* Prediction Deadline Reminder
* Match Starting Soon
* Rank Changes

---

## Social Features

* Comments
* Match Discussions
* Emoji Reactions

---

# Technical Architecture

## Frontend

* React 19
* TypeScript
* React Router
* TanStack Query
* Zustand
* TailwindCSS
* ShadCN UI

---

## Backend

* Node.js
* NestJS

---

## Database

* PostgreSQL

Core Tables:

Users
Pools
PoolMembers
Matches
Predictions
Scores
Leaderboards

---

## Authentication

* JWT
* Google OAuth

---

## APIs

### User

POST /auth/login
POST /auth/register

### Pools

POST /pools
GET /pools
POST /pools/join

### Predictions

POST /predictions
GET /predictions

### Leaderboard

GET /leaderboard
GET /pool/:id/leaderboard

---

# Success Metrics

### Engagement

* Daily Active Users
* Predictions Submitted

### Retention

* Users returning before each match

### Competition

* Average Pools Per User
* Average Members Per Pool

---

# Future Monetization

* Premium Pools
* Custom Scoring Rules
* Ad-Free Experience
* Sponsored Tournaments
* Prediction Analytics Subscription

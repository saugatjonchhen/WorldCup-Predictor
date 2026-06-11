# 🏆 FIFA World Cup 2026 Predictor

A modern, real-time web application that allows football fans to predict FIFA World Cup 2026 match outcomes, build private pools to compete with friends, simulate matches, and track live leaderboards.

---

## 🌟 Key Features

*   **🔐 User Authentication**: Safe and secure sign-up, sign-in, and profile management powered by **Supabase Auth**.
*   **⚽ Match Predictions**: Predict final scores (Home vs. Away) for all group stage matches. Predictions are automatically locked 2 hours prior to kickoff.
*   **📊 Knockout Stage Advancement**: Predict the advancing teams for the Round of 16, Quarterfinals, Semifinals, and the Final.
*   **👥 Private Prediction Pools**:
    *   Create private pools with custom names and descriptions.
    *   Invite friends using a unique invite code or link.
    *   Compete on pool-specific leaderboards.
*   **🔥 Live Leaderboard**: Real-time points tally and rank tracking inside each private pool, automatically updated as match scores change.
*   **🧮 Dynamic Scoring Engine**:
    *   **Exact Score**: `+5 points` (correct result + correct goals for both teams)
    *   **Correct Goal Difference**: `+2 points` (correct goal difference, e.g., predicted 2-1, actual 1-0)
    *   **Correct Result**: `+3 points` (correct winner or draw)
    *   **Knockout Stage Bonus**: `+2 points` for predicting the correct team advancing to the next round.
*   **🔮 Match Simulator**: Interactive tournament bracket simulator to forecast matchups and stages.
*   **⏱️ Localized Match Times**: Kickoff times are automatically adjusted and formatted to your local timezone.
*   **📖 Rules & Scoring Reference**: Dedicated rules section explaining scoring matrices, points breakdowns, and locking rules with interactive examples.

---

## 🛠️ Tech Stack

### Frontend
*   **React 19** & **TypeScript**
*   **Vite** (Next-gen frontend tooling)
*   **TailwindCSS v4** (Modern utility-first CSS styling)
*   **Lucide React** (Beautifully rendered UI icons)
*   **Shadcn/UI** (Accessible and clean UI components)
*   **Zustand** (Ultra-lightweight state management)
*   **React Router v7** (Declarative client-side routing)

### Backend & Database
*   **Supabase** (Backend-as-a-Service)
    *   **PostgreSQL**: Core relational database storing matches, predictions, pools, and profiles.
    *   **Auth**: Email-based user accounts and profile setup.
    *   **Realtime**: Real-time score updates and leaderboard calculations.
    *   **Row-Level Security (RLS)**: Fine-grained security policies securing user predictions and pool management.

---

## 🚀 Getting Started

### Prerequisites
*   [Node.js](https://nodejs.org/) (v18+ recommended)
*   [npm](https://www.npmjs.com/) or [yarn](https://yarnpkg.com/)
*   A [Supabase](https://supabase.com/) project

### Local Installation

1.  **Clone the Repository**:
    ```bash
    git clone https://github.com/saugatjonchhen/WorldCup-Predictor.git
    cd WorldCup-Predictor
    ```

2.  **Install Dependencies**:
    ```bash
    npm install
    ```

3.  **Environment Variables Setup**:
    Copy the sample environment file and add your Supabase project credentials:
    ```bash
    cp .env.example .env.local
    ```
    Open `.env.local` and configure:
    ```env
    VITE_SUPABASE_URL=https://your-project-id.supabase.co
    VITE_SUPABASE_ANON_KEY=your-anon-key-here
    ```

4.  **Database Migrations**:
    Apply the database migrations in the `/supabase/migrations` folder to your Supabase instance, or use the Supabase CLI to apply migrations locally/remotely:
    ```bash
    # Apply combined migration to your project
    supabase db push
    ```

5.  **Seed Default Matches and Teams**:
    Execute the seed script `/supabase/seed.sql` inside your Supabase SQL editor to populate all 2026 World Cup teams and match schedules.

6.  **Run Locally**:
    ```bash
    npm run dev
    ```
    Open [http://localhost:5173](http://localhost:5173) in your browser to view the application!

---

## 📂 Project Structure

```text
├── public/               # Static assets & icons
├── src/
│   ├── assets/           # App-wide images and styling helpers
│   ├── components/       # Reusable layout and UI elements
│   ├── contexts/         # React Context providers (e.g., Auth)
│   ├── data/             # Mock/static data configurations
│   ├── lib/              # Supabase clients & utility functions
│   ├── pages/            # Page components (Dashboard, Pools, Profile, etc.)
│   ├── router/           # React Router route definitions
│   ├── index.css         # Tailwind global styles
│   └── main.tsx          # Application entry point
├── supabase/
│   ├── migrations/       # SQL migrations detailing schema, RLS, and RPCs
│   └── seed.sql          # Seed data for teams & match schedules
├── netlify.toml          # Deployment configuration for Netlify
└── package.json          # Node dependencies and scripts
```

---

## 🌐 Deployment

This application is ready to deploy on **Netlify**. A custom `netlify.toml` is included to handle client-side routing rewrites:

```toml
[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

Simply connect this repository to your Netlify dashboard, configure the `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` environment variables, and trigger a build.

---

## 📄 License

This project is licensed under the MIT License.

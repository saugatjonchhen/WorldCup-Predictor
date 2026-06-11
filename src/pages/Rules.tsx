import { useState } from 'react'
import { Layout } from '@/components/Layout'


export default function Rules() {
  // Simulator State
  const [predHome, setPredHome] = useState<number>(2)
  const [predAway, setPredAway] = useState<number>(1)
  const [actualHome, setActualHome] = useState<number>(2)
  const [actualAway, setActualAway] = useState<number>(1)
  const [isKnockout, setIsKnockout] = useState<boolean>(false)
  const [predAdvancing, setPredAdvancing] = useState<'home' | 'away'>('home')
  const [actualAdvancing, setActualAdvancing] = useState<'home' | 'away'>('home')

  // Calculate points based on user's input in the simulator
  function calculateSimulatorPoints() {
    let pts = 0
    const breakDown: string[] = []

    const predWinner = predHome > predAway ? 'home' : predHome < predAway ? 'away' : 'draw'
    const actualWinner = actualHome > actualAway ? 'home' : actualAway > actualHome ? 'away' : 'draw'

    const predDiff = predHome - predAway
    const actualDiff = actualHome - actualAway

    const isExact = predHome === actualHome && predAway === actualAway

    // Check correct outcome
    const correctOutcome = predWinner === actualWinner
    if (correctOutcome) {
      pts += 3
      breakDown.push('🏆 Correct Outcome/Winner (+3 pts)')

      // Check correct goal difference
      const correctGD = predDiff === actualDiff
      if (correctGD && (predWinner !== 'draw' || isExact)) {
        pts += 2
        breakDown.push('📊 Correct Goal Difference (+2 pts)')
      }
    }

    // Check exact score
    if (isExact) {
      pts += 5
      breakDown.push('🎯 Exact Score Match (+5 pts)')
    }

    if (isKnockout && (actualWinner === 'draw' || isKnockout)) {
      if (predAdvancing === actualAdvancing) {
        pts += 2
        breakDown.push('🔮 Correct Advancing Team (+2 pts)')
      }
    }

    return { total: pts, breakDown }
  }

  const simResult = calculateSimulatorPoints()

  return (
    <Layout>
      <div className="space-y-8 animate-fade-in">
        {/* Header section */}
        <div className="border-b border-border/40 pb-6">
          <h1 className="text-3xl font-extrabold font-display text-gradient">
            Tournament Rules & Scoring
          </h1>
          <p className="text-text-secondary text-sm mt-1">
            Understand how points are distributed, prediction deadlines, and test predictions using the interactive simulator.
          </p>
        </div>

        {/* Scoring cards grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="glass p-5 rounded-2xl border border-border flex flex-col justify-between hover:border-brand/40 transition-colors">
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-2xl">🎯</span>
                <span className="text-xs font-black bg-brand/10 text-brand px-2.5 py-1 rounded-full border border-brand/20">
                  5 POINTS
                </span>
              </div>
              <h3 className="font-display font-bold text-base text-text-primary">Exact Score</h3>
              <p className="text-xs text-text-secondary mt-2 leading-relaxed">
                Predict the exact match score correctly (both home and away goals).
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-border/40 text-[10px] text-text-muted">
              <span className="font-bold text-text-secondary">Example:</span> Pred: 2-1 | Actual: 2-1
            </div>
          </div>

          <div className="glass p-5 rounded-2xl border border-border flex flex-col justify-between hover:border-brand/40 transition-colors">
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-2xl">🏆</span>
                <span className="text-xs font-black bg-brand/10 text-brand px-2.5 py-1 rounded-full border border-brand/20">
                  3 POINTS
                </span>
              </div>
              <h3 className="font-display font-bold text-base text-text-primary">Correct Winner / Draw</h3>
              <p className="text-xs text-text-secondary mt-2 leading-relaxed">
                Predict the correct winner or a draw, without guessing the exact score.
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-border/40 text-[10px] text-text-muted">
              <span className="font-bold text-text-secondary">Example:</span> Pred: 3-1 | Actual: 1-0 (Home Win)
            </div>
          </div>

          <div className="glass p-5 rounded-2xl border border-border flex flex-col justify-between hover:border-brand/40 transition-colors">
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-2xl">📊</span>
                <span className="text-xs font-black bg-brand/10 text-brand px-2.5 py-1 rounded-full border border-brand/20">
                  +2 POINTS
                </span>
              </div>
              <h3 className="font-display font-bold text-base text-text-primary">Goal Difference</h3>
              <p className="text-xs text-text-secondary mt-2 leading-relaxed">
                Earn bonus points if you predicted the correct winner and the correct goal difference.
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-border/40 text-[10px] text-text-muted">
              <span className="font-bold text-text-secondary">Example:</span> Pred: 3-1 (+2 GD) | Actual: 2-0 (+2 GD)
            </div>
          </div>

          <div className="glass p-5 rounded-2xl border border-border flex flex-col justify-between hover:border-brand/40 transition-colors">
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-2xl">🔮</span>
                <span className="text-xs font-black bg-brand/10 text-brand px-2.5 py-1 rounded-full border border-brand/20">
                  2 POINTS
                </span>
              </div>
              <h3 className="font-display font-bold text-base text-text-primary">Correct Advancing Team</h3>
              <p className="text-xs text-text-secondary mt-2 leading-relaxed">
                For knockout stage matches, predict which team advances (even after extra time or penalties).
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-border/40 text-[10px] text-text-muted">
              <span className="font-bold text-text-secondary">Example:</span> Pred: 1-1 (Team A advances via PK)
            </div>
          </div>
        </div>

        {/* Detailed scoring details and simulation */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Rules and Deadlines */}
          <div className="lg:col-span-2 space-y-6">
            <div className="glass p-6 rounded-2xl border border-border space-y-4">
              <h2 className="text-lg font-bold font-display text-text-primary flex items-center gap-2">
                📅 Submission Deadlines
              </h2>
              <div className="divider" />
              <div className="space-y-4 text-sm">
                <div className="flex gap-4">
                  <span className="text-xl">⚽</span>
                  <div>
                    <h4 className="font-bold text-text-primary">Match Predictions</h4>
                    <p className="text-xs text-text-secondary mt-1">
                      Predictions lock exactly <span className="text-brand font-bold">2 hours before kickoff</span> of each respective match. No changes are permitted after this deadline.
                    </p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <span className="text-xl">🔮</span>
                  <div>
                    <h4 className="font-bold text-text-primary">Bracket / Stage Predictions</h4>
                    <p className="text-xs text-text-secondary mt-1">
                      Tournament Stage predictions (Round of 16, Quarterfinals, Semifinals, Finals, Champion) lock exactly <span className="text-brand font-bold">2 hours before the first Round of 32 match starts</span>.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="glass p-6 rounded-2xl border border-border space-y-4">
              <h2 className="text-lg font-bold font-display text-text-primary flex items-center gap-2">
                👑 Bracket Stage Points
              </h2>
              <div className="divider" />
              <p className="text-xs text-text-secondary">
                Predict which teams advance to the final phases of the tournament. Points are awarded once the teams playing in each stage are officially confirmed.
              </p>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="bg-surface-2 p-3.5 rounded-xl border border-border flex justify-between items-center">
                  <span className="font-semibold text-text-primary">Round of 16</span>
                  <span className="font-bold text-brand bg-brand-muted px-2 py-0.5 rounded">2 pts per correct team</span>
                </div>
                <div className="bg-surface-2 p-3.5 rounded-xl border border-border flex justify-between items-center">
                  <span className="font-semibold text-text-primary">Quarterfinals</span>
                  <span className="font-bold text-brand bg-brand-muted px-2 py-0.5 rounded">2 pts per correct team</span>
                </div>
                <div className="bg-surface-2 p-3.5 rounded-xl border border-border flex justify-between items-center">
                  <span className="font-semibold text-text-primary">Semifinals</span>
                  <span className="font-bold text-brand bg-brand-muted px-2 py-0.5 rounded">2 pts per correct team</span>
                </div>
                <div className="bg-surface-2 p-3.5 rounded-xl border border-border flex justify-between items-center">
                  <span className="font-semibold text-text-primary">Finalists</span>
                  <span className="font-bold text-brand bg-brand-muted px-2 py-0.5 rounded">2 pts per correct team</span>
                </div>
                <div className="bg-surface-2 p-3.5 rounded-xl border border-border flex justify-between items-center sm:col-span-2">
                  <span className="font-semibold text-text-primary">Tournament Champion</span>
                  <span className="font-bold text-gold bg-gold-muted px-2.5 py-0.5 rounded">20 pts for correct champion</span>
                </div>
              </div>
            </div>
          </div>

          {/* Interactive scoring simulator */}
          <div className="lg:col-span-1">
            <div className="glass p-6 rounded-2xl border border-border space-y-6 sticky top-24">
              <div>
                <h2 className="text-lg font-bold font-display text-text-primary flex items-center gap-2">
                  ⚡ Scoring Simulator
                </h2>
                <p className="text-[10px] text-text-secondary mt-1">
                  Test your score predictions against actual outcomes to see points earned.
                </p>
              </div>

              <div className="divider" />

              {/* Match Type Switcher */}
              <div className="flex items-center justify-between bg-surface-2 p-1 border border-border rounded-xl">
                <button
                  onClick={() => setIsKnockout(false)}
                  className={`flex-1 text-center py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors ${
                    !isKnockout ? 'bg-brand text-text-inverse shadow-brand' : 'text-text-secondary hover:text-text-primary'
                  }`}
                >
                  Group Match
                </button>
                <button
                  onClick={() => setIsKnockout(true)}
                  className={`flex-1 text-center py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors ${
                    isKnockout ? 'bg-brand text-text-inverse shadow-brand' : 'text-text-secondary hover:text-text-primary'
                  }`}
                >
                  Knockout Match
                </button>
              </div>

              {/* Prediction inputs */}
              <div className="space-y-3">
                <h3 className="text-[10px] uppercase font-black tracking-widest text-text-muted">
                  Your Prediction
                </h3>
                <div className="flex items-center justify-between gap-4 bg-surface-2/40 px-4 py-3 border border-border/60 rounded-xl">
                  <div className="flex flex-col items-center gap-1">
                    <span className="text-[10px] font-bold text-text-secondary">Home</span>
                    <input
                      type="number"
                      min="0"
                      value={predHome}
                      onChange={(e) => setPredHome(Math.max(0, parseInt(e.target.value) || 0))}
                      className="w-12 h-10 text-center font-bold bg-surface-2 border border-border rounded-lg text-sm"
                    />
                  </div>
                  <span className="font-bold text-text-muted">-</span>
                  <div className="flex flex-col items-center gap-1">
                    <span className="text-[10px] font-bold text-text-secondary">Away</span>
                    <input
                      type="number"
                      min="0"
                      value={predAway}
                      onChange={(e) => setPredAway(Math.max(0, parseInt(e.target.value) || 0))}
                      className="w-12 h-10 text-center font-bold bg-surface-2 border border-border rounded-lg text-sm"
                    />
                  </div>
                </div>
              </div>

              {/* Actual Outcome inputs */}
              <div className="space-y-3">
                <h3 className="text-[10px] uppercase font-black tracking-widest text-text-muted">
                  Actual Result
                </h3>
                <div className="flex items-center justify-between gap-4 bg-surface-2/40 px-4 py-3 border border-border/60 rounded-xl">
                  <div className="flex flex-col items-center gap-1">
                    <span className="text-[10px] font-bold text-text-secondary">Home</span>
                    <input
                      type="number"
                      min="0"
                      value={actualHome}
                      onChange={(e) => setActualHome(Math.max(0, parseInt(e.target.value) || 0))}
                      className="w-12 h-10 text-center font-bold bg-surface-2 border border-border rounded-lg text-sm"
                    />
                  </div>
                  <span className="font-bold text-text-muted">-</span>
                  <div className="flex flex-col items-center gap-1">
                    <span className="text-[10px] font-bold text-text-secondary">Away</span>
                    <input
                      type="number"
                      min="0"
                      value={actualAway}
                      onChange={(e) => setActualAway(Math.max(0, parseInt(e.target.value) || 0))}
                      className="w-12 h-10 text-center font-bold bg-surface-2 border border-border rounded-lg text-sm"
                    />
                  </div>
                </div>
              </div>

              {/* Knockout Advancing Options */}
              {isKnockout && (
                <div className="space-y-3 p-3 bg-surface-2/30 border border-border/50 rounded-xl">
                  <h4 className="text-[10px] uppercase font-black tracking-widest text-text-muted">
                    Advancing Team
                  </h4>
                  
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <div className="text-[9px] font-bold text-text-secondary mb-1">Predicted to Go Through:</div>
                      <select
                        value={predAdvancing}
                        onChange={(e) => setPredAdvancing(e.target.value as any)}
                        className="w-full bg-surface-2 border border-border rounded-lg p-1.5 text-xs font-bold"
                      >
                        <option value="home">Home Team</option>
                        <option value="away">Away Team</option>
                      </select>
                    </div>

                    <div>
                      <div className="text-[9px] font-bold text-text-secondary mb-1">Actually Went Through:</div>
                      <select
                        value={actualAdvancing}
                        onChange={(e) => setActualAdvancing(e.target.value as any)}
                        className="w-full bg-surface-2 border border-border rounded-lg p-1.5 text-xs font-bold"
                      >
                        <option value="home">Home Team</option>
                        <option value="away">Away Team</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* Calculated Result */}
              <div className="p-4 bg-brand-muted border border-brand/20 rounded-2xl flex flex-col gap-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-text-primary">Total Points Earned:</span>
                  <span className="text-2xl font-black text-brand">{simResult.total} pts</span>
                </div>
                {simResult.breakDown.length > 0 ? (
                  <div className="space-y-1.5 mt-2">
                    {simResult.breakDown.map((item, idx) => (
                      <div key={idx} className="text-[10px] font-bold text-text-primary flex items-center gap-1.5">
                        {item}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-[10px] text-text-secondary italic mt-1">
                    No points scored for this prediction. Keep trying!
                  </div>
                )}
              </div>

            </div>
          </div>

        </div>
      </div>
    </Layout>
  )
}

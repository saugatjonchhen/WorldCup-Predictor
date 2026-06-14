import { useState } from 'react';
import { StatCard } from '../components/insights/StatCard';
import { Layout } from '../components/Layout';
import {
  Flame, Crosshair, Goal, Shield,
  AlertTriangle, SquareUser, Users, ShieldAlert,
  BarChart3
} from 'lucide-react';

const generateMockData = () => {
  const data: Record<string, any[]> = {};

  // Players
  data['goals'] = [
    { name: 'Kylian Mbappé', team: 'France', value: 8, rank: 1, flag: 'https://flagcdn.com/w80/fr.png' },
    { name: 'Lionel Messi', team: 'Argentina', value: 7, rank: 2, flag: 'https://flagcdn.com/w80/ar.png' },
    { name: 'Harry Kane', team: 'England', value: 6, rank: 3, flag: 'https://flagcdn.com/w80/gb-eng.png' }
  ];
  data['assists'] = [
    { name: 'Lionel Messi', team: 'Argentina', value: 5, rank: 1, flag: 'https://flagcdn.com/w80/ar.png' },
    { name: 'Kevin De Bruyne', team: 'Belgium', value: 4, rank: 2, flag: 'https://flagcdn.com/w80/be.png' },
    { name: 'Bruno Fernandes', team: 'Portugal', value: 3, rank: 3, flag: 'https://flagcdn.com/w80/pt.png' }
  ];
  data['penalty_goals'] = [
    { name: 'Kylian Mbappé', team: 'France', value: 3, rank: 1, flag: 'https://flagcdn.com/w80/fr.png' },
    { name: 'Harry Kane', team: 'England', value: 2, rank: 2, flag: 'https://flagcdn.com/w80/gb-eng.png' }
  ];
  data['yellow_cards'] = [
    { name: 'João Palhinha', team: 'Portugal', value: 3, rank: 1, flag: 'https://flagcdn.com/w80/pt.png' },
    { name: 'Cristian Romero', team: 'Argentina', value: 2, rank: 2, flag: 'https://flagcdn.com/w80/ar.png' }
  ];
  data['red_cards'] = [
    { name: 'Pepe', team: 'Portugal', value: 1, rank: 1, flag: 'https://flagcdn.com/w80/pt.png' }
  ];

  // Teams
  data['goals_per_match'] = [
    { team: 'France', value: 2.5, rank: 1, flag: 'https://flagcdn.com/w80/fr.png' },
    { team: 'England', value: 2.2, rank: 2, flag: 'https://flagcdn.com/w80/gb-eng.png' },
    { team: 'Brazil', value: 2.0, rank: 3, flag: 'https://flagcdn.com/w80/br.png' }
  ];
  data['conceded_per_match'] = [
    { team: 'Brazil', value: 0.5, rank: 1, flag: 'https://flagcdn.com/w80/br.png' },
    { team: 'Argentina', value: 0.67, rank: 2, flag: 'https://flagcdn.com/w80/ar.png' },
    { team: 'England', value: 0.83, rank: 3, flag: 'https://flagcdn.com/w80/gb-eng.png' }
  ];
  data['clean_sheets'] = [
    { team: 'Brazil', value: 4, rank: 1, flag: 'https://flagcdn.com/w80/br.png' },
    { team: 'Argentina', value: 3, rank: 2, flag: 'https://flagcdn.com/w80/ar.png' }
  ];

  return data;
};

export default function Insights() {
  const [activeTab, setActiveTab] = useState<'players' | 'teams'>('players');

  const mockData = generateMockData();

  const getStatData = (_category: string, type: string) => {
    return mockData[type] || [];
  };

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-4 py-8 pb-24">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 mb-8">
          <div>
            <h1 className="text-3xl font-black text-white flex items-center gap-3">
              <BarChart3 className="w-8 h-8 text-primary" />
              Tournament Insights
            </h1>
            <p className="text-text-muted mt-2">
              Advanced statistics powered by mock data (live sync hidden)
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex bg-card border border-border/10 p-1 rounded-xl w-full max-w-sm mb-8 relative">
          <div
            className="absolute inset-y-1 w-[calc(50%-4px)] bg-primary/20 rounded-lg transition-transform duration-300 ease-out z-0"
            style={{ transform: `translateX(${activeTab === 'players' ? '0' : '100%'})`, marginLeft: activeTab === 'players' ? '4px' : '0px' }}
          />
          <button
            onClick={() => setActiveTab('players')}
            className={`flex-1 py-2.5 text-sm font-bold rounded-lg transition-colors z-10 flex items-center justify-center gap-2
              ${activeTab === 'players' ? 'text-primary' : 'text-text-muted hover:text-white'}`}
          >
            <SquareUser className="w-4 h-4" />
            Players
          </button>
          <button
            onClick={() => setActiveTab('teams')}
            className={`flex-1 py-2.5 text-sm font-bold rounded-lg transition-colors z-10 flex items-center justify-center gap-2
              ${activeTab === 'teams' ? 'text-primary' : 'text-text-muted hover:text-white'}`}
          >
            <Users className="w-4 h-4" />
            Teams
          </button>
        </div>

        {/* Player Stats */}
        {activeTab === 'players' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-fade-in">
            <StatCard
              title="Top Scorers"
              icon={Flame}
              type="player"
              data={getStatData('players', 'goals')}
              isLoading={false}
              error={null}
            />
            <StatCard
              title="Top Assists"
              icon={Crosshair}
              type="player"
              data={getStatData('players', 'assists')}
              isLoading={false}
              error={null}
            />
            <StatCard
              title="Penalty Goals"
              icon={Goal}
              type="player"
              data={getStatData('players', 'penalty_goals')}
              isLoading={false}
              error={null}
            />
            <StatCard
              title="Yellow Cards"
              icon={AlertTriangle}
              type="player"
              data={getStatData('players', 'yellow_cards')}
              isLoading={false}
              error={null}
            />
            <StatCard
              title="Red Cards"
              icon={ShieldAlert}
              type="player"
              data={getStatData('players', 'red_cards')}
              isLoading={false}
              error={null}
            />
          </div>
        )}

        {/* Team Stats */}
        {activeTab === 'teams' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-fade-in">
            <StatCard
              title="Goals Per Match"
              icon={Goal}
              type="team"
              data={getStatData('teams', 'goals_per_match')}
              isLoading={false}
              error={null}
            />
            <StatCard
              title="Conceded Per Match"
              icon={Shield}
              type="team"
              data={getStatData('teams', 'conceded_per_match')}
              isLoading={false}
              error={null}
            />
            <StatCard
              title="Clean Sheets"
              icon={ShieldAlert}
              type="team"
              data={getStatData('teams', 'clean_sheets')}
              isLoading={false}
              error={null}
            />
          </div>
        )}

      </div>
    </Layout>
  );
}

import React from 'react';
import { Trophy, Medal, AlertTriangle } from 'lucide-react';

export interface StatItem {
  name?: string; // For player
  team?: string; // For team
  value: string | number;
  rank: number;
  flag?: string;
}

interface StatCardProps {
  title: string;
  icon: React.ElementType;
  data: StatItem[];
  isLoading: boolean;
  error: Error | null;
  type: 'player' | 'team';
}

export function StatCard({ title, icon: Icon, data, isLoading, error, type }: StatCardProps) {
  if (error) {
    return (
      <div className="bg-card border border-border/10 rounded-2xl p-6 flex flex-col items-center justify-center text-center h-full min-h-[300px]">
        <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mb-4">
          <AlertTriangle className="w-6 h-6 text-red-500" />
        </div>
        <h3 className="text-lg font-bold text-white mb-2">{title}</h3>
        <p className="text-sm text-text-muted">Unable to load data.</p>
        <p className="text-xs text-red-400 mt-2">{error.message || 'Data sync required'}</p>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border/10 rounded-2xl overflow-hidden flex flex-col h-full">
      <div className="p-5 border-b border-border/5 bg-gradient-to-r from-card to-card-hover/30 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center text-primary">
          <Icon className="w-5 h-5" />
        </div>
        <h3 className="font-bold text-lg text-white">{title}</h3>
      </div>
      
      <div className="p-2 flex-1">
        {isLoading ? (
          <div className="flex flex-col gap-2 p-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-14 bg-border/5 animate-pulse rounded-xl" />
            ))}
          </div>
        ) : data && data.length > 0 ? (
          <div className="flex flex-col gap-1">
            {data.slice(0, 5).map((item, index) => (
              <div 
                key={index} 
                className="flex items-center gap-4 p-3 rounded-xl hover:bg-card-hover/50 transition-colors group"
              >
                <div className="w-8 flex justify-center">
                  {item.rank === 1 ? (
                    <Trophy className="w-5 h-5 text-yellow-500" />
                  ) : item.rank === 2 ? (
                    <Medal className="w-5 h-5 text-gray-400" />
                  ) : item.rank === 3 ? (
                    <Medal className="w-5 h-5 text-amber-600" />
                  ) : (
                    <span className="text-sm font-bold text-text-muted">{item.rank}</span>
                  )}
                </div>
                
                {item.flag && (
                  <img 
                    src={item.flag} 
                    alt={item.team || item.name} 
                    className="w-8 h-5 object-cover rounded shadow-sm"
                    onError={(e) => { e.currentTarget.src = 'https://flagcdn.com/w80/un.png' }}
                  />
                )}
                
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-white truncate">
                    {type === 'player' ? item.name : item.team}
                  </div>
                  {type === 'player' && item.team && (
                    <div className="text-xs text-text-muted truncate">{item.team}</div>
                  )}
                </div>
                
                <div className="font-black text-xl text-primary drop-shadow-sm group-hover:scale-110 transition-transform">
                  {item.value}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-40 text-text-muted">
            <p className="text-sm">No data available yet</p>
          </div>
        )}
      </div>
    </div>
  );
}

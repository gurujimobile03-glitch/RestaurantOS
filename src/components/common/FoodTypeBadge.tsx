import React from 'react';
import { FoodType } from '../../types/menu';

interface FoodTypeBadgeProps {
  type: FoodType;
  showLabel?: boolean;
}

export const FoodTypeBadge: React.FC<FoodTypeBadgeProps> = ({ type, showLabel = true }) => {
  if (type === 'veg') {
    return (
      <span className="inline-flex items-center gap-1.5" title="Vegetarian">
        <span className="w-4 h-4 rounded-xs border-2 border-emerald-600 flex items-center justify-center bg-white shrink-0">
          <span className="w-2 h-2 rounded-full bg-emerald-600" />
        </span>
        {showLabel && <span className="text-xs font-semibold text-emerald-700">Veg</span>}
      </span>
    );
  }

  if (type === 'nonVeg') {
    return (
      <span className="inline-flex items-center gap-1.5" title="Non-Vegetarian">
        <span className="w-4 h-4 rounded-xs border-2 border-rose-600 flex items-center justify-center bg-white shrink-0">
          <span className="w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-b-[7px] border-b-rose-600 mb-0.5" />
        </span>
        {showLabel && <span className="text-xs font-semibold text-rose-700">Non-Veg</span>}
      </span>
    );
  }

  if (type === 'egg') {
    return (
      <span className="inline-flex items-center gap-1.5" title="Contains Egg">
        <span className="w-4 h-4 rounded-xs border-2 border-amber-600 flex items-center justify-center bg-white shrink-0">
          <span className="w-2 h-2.5 rounded-full bg-amber-600" />
        </span>
        {showLabel && <span className="text-xs font-semibold text-amber-700">Egg</span>}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5" title="Other">
      <span className="w-4 h-4 rounded-xs border-2 border-slate-400 flex items-center justify-center bg-white shrink-0">
        <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
      </span>
      {showLabel && <span className="text-xs font-semibold text-slate-600">Other</span>}
    </span>
  );
};

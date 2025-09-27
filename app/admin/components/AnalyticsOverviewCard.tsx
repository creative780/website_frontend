import React from 'react';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react';

export const AnalyticsOverviewCard = ({ title, value, change }: { title: string; value: string; change: string }) => {
  const isPositive = change.startsWith('+');
  return (
    <div className="bg-white border border-gray-200 px-4 py-3 rounded-md">
      <div className="text-xs text-gray-500 mb-1">{title}</div>
      <div className="text-xl font-semibold text-gray-900">{value}</div>
      <div className={`flex items-center text-xs mt-1 ${isPositive ? 'text-green-500' : 'text-red-500'}`}>
        {isPositive ? <ArrowUpRight className="w-3 h-3 mr-1" /> : <ArrowDownRight className="w-3 h-3 mr-1" />}
        {change} vs last week
      </div>
    </div>
  );
};

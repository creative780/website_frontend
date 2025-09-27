import React from 'react';
import { Pie } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';

ChartJS.register(ArcElement, Tooltip, Legend);

export const AnalyticsPieChart = ({ title }: { title: string }) => {
  const data = {
    labels: ['Organic', 'Direct', 'Referral', 'Social'],
    datasets: [
      {
        label: 'Traffic Sources',
        data: [40, 30, 20, 10],
        backgroundColor: ['#10b981', '#3b82f6', '#f59e0b', '#ef4444'],
      },
    ],
  };

  return (
    <div className="bg-white border border-gray-200 px-4 py-3 rounded-md">
      <div className="text-sm font-medium text-gray-700 mb-2">{title}</div>
      <Pie data={data} />
    </div>
  );
};

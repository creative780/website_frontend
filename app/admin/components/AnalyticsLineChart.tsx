import React from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

export const AnalyticsLineChart = ({ title }: { title: string }) => {
  const data = {
    labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    datasets: [
      {
        label: 'Users',
        data: [1200, 1900, 3000, 5000, 2300, 4000, 3200],
        borderColor: '#891F1A',
        backgroundColor: 'rgba(59, 130, 246, 0.2)',
        tension: 0.4,
      },
    ],
  };

  const options = {
    responsive: true,
    plugins: {
      legend: { display: false },
    },
    scales: {
      y: {
        grid: { color: '#891F1A' },
        ticks: { color: '#891F1A', font: { size: 10 } },
      },
      x: {
        grid: { display: false },
        ticks: { color: '#891F1A', font: { size: 10 } },
      },
    },
  };

  return (
    <div className="bg-white border border-gray-200 px-4 py-3 rounded-md">
      <div className="text-sm font-medium text-gray-700 mb-2">{title}</div>
      <Line data={data} options={options} height={140} style={{color: '#891F1A'}} />
    </div>
  );
};
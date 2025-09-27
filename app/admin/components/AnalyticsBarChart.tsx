// File: /components/admin/AnalyticsBarChart.tsx
import React from 'react';
import { Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

export const AnalyticsBarChart = ({ title }: { title: string }) => {
  const data = {
    labels: ['Homepage', 'Pricing', 'Blog', 'Contact', 'Login'],
    datasets: [
      {
        label: 'Page Views',
        data: [5000, 3000, 2000, 1500, 1000],
        backgroundColor: '#2563eb',
        borderRadius: 3,
        barPercentage: 0.6,
        categoryPercentage: 0.6,
      },
    ],
  };

  const options = {
    responsive: true,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#111827',
        titleFont: { size: 12 },
        bodyFont: { size: 12 },
        padding: 8,
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        grid: { color: '#e5e7eb' },
        ticks: { color: '#4b5563', font: { size: 11 } },
      },
      x: {
        grid: { display: false },
        ticks: { color: '#4b5563', font: { size: 11 } },
      },
    },
  };

  return (
    <div className="bg-white border border-gray-200 rounded-md p-4">
      <div className="text-xs font-medium text-gray-700 mb-2 uppercase tracking-wide">{title}</div>
      <Bar data={data} options={options} height={120} />
    </div>
  );
};

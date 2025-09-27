'use client';

import React, { useEffect, useState } from 'react';
import { Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip);

export const AnalyticsRealtimeChart = () => {
  const [chartData, setChartData] = useState({
    labels: Array.from({ length: 30 }, (_, i) => `${i + 1}`),
    datasets: [
      {
        data: Array.from({ length: 30 }, () => Math.floor(Math.random() * 5)),
        backgroundColor: '#891F1A',
        borderRadius: 2,
        barPercentage: 1,
        categoryPercentage: 1,
      },
    ],
  });

  useEffect(() => {
    const interval = setInterval(() => {
      setChartData(prev => {
        const newData = [...prev.datasets[0].data.slice(1), Math.floor(Math.random() * 5)];
        return {
          ...prev,
          datasets: [{ ...prev.datasets[0], data: newData }],
        };
      });
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: { enabled: false },
    },
    scales: {
      x: { display: false },
      y: {
        display: false,
        beginAtZero: true,
        ticks: { stepSize: 1 },
        grid: { display: false },
      },
    },
  };

  return (
    <div className="h-full w-full">
        <Bar data={chartData} options={options} className="w-full h-full" />

    </div>
  );
};

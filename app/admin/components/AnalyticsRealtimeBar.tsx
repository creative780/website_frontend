// /components/admin/AnalyticsRealtimeBar.tsx
import React from 'react';
import { Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip);

export const AnalyticsRealtimeBar = () => {
  // Data points to mimic the image_398c49.png
  // This represents 30 minutes, where most minutes have 0 active users,
  // and only specific minutes show active users (e.g., 2 and 4 users).
  // The '0' values create the gaps, and the non-zero values create the bars.
  const dataForImage1 = [
    0, 0, 0, 0, 0, // Gap
    0, 0, 0, 0, 0, // Gap
    0, 0, 0, // More Gap
    2, 4, // First set of bars (e.g., at minute 14 and 15)
    0, 0, 0, 0, 0, // Gap
    0, 0, 0, // More Gap
    2, 4, // Second set of bars (e.g., at minute 25 and 26)
    0, 0, 0, 0, 0 // Remaining gap to fill 30 minutes
  ];

  const data = {
    labels: Array.from({ length: 30 }, (_, i) => `${i + 1}m`), // Labels for 30 minutes
    datasets: [
      {
        label: 'Active Users',
        data: dataForImage1, // Use the specific data to match image_398c49.png
        backgroundColor: '#891F1A', // A shade of blue, similar to the image
        borderRadius: 2, // Slightly rounded corners
        barPercentage: 0.8, // Control the width of each bar relative to the category width
        categoryPercentage: 0.9, // Control the spacing between categories (minutes)
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      tooltip: {
        enabled: true, // Keep tooltips for interactivity
        backgroundColor: '#891F1A', // Dark background for tooltip
        titleFont: { size: 10 },
        bodyFont: { size: 10 },
        padding: 6,
        cornerRadius: 4,
        displayColors: false, // Don't show color box in tooltip
      },
    },
    scales: {
      x: {
        display: false, // Hide x-axis labels and lines
        grid: {
          display: false, // Hide x-axis grid lines
        },
        ticks: {
          // You might need to adjust tick parameters if you want more control over bar spacing
          // but for just replicating the visual, `barPercentage` and `categoryPercentage` are key.
        }
      },
      y: {
        display: false, // Hide y-axis labels and lines
        beginAtZero: true, // Start y-axis from zero
        grid: {
          display: false, // Hide y-axis grid lines
        },
        max: 5, // Set a max value slightly above the highest data point (4) for better scaling
      },
    },
    // Adding layout padding to ensure bars are not cut off if they are at the edges
    layout: {
      padding: {
        left: 0,
        right: 0,
        top: 0,
        bottom: 0,
      }
    }
  };

  return (
    <div className="h-full">
      <Bar data={data} options={options} />
    </div>
  );
};
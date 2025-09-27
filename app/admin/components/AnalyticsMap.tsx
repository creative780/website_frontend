{/* Card: Active Users by Country */}
<div className="bg-white border border-gray-200 rounded-md p-4 shadow-sm relative">
  <h3 className="text-xs font-semibold text-gray-600 uppercase mb-3">Active users <span className="normal-case">by Country ID</span></h3>

  {/* World Map with Highlight */}
  <div className="relative w-full h-40 bg-gray-100 rounded mb-4 overflow-hidden flex items-center justify-center">
    <img
      src="/world-map.png" // Replace with your actual world map image
      alt="World Map"
      className="w-full h-full object-contain"
    />
    {/* Tooltip hover box (mocked for now) */}
    <div className="absolute bottom-2 left-2 bg-white text-xs text-gray-700 shadow-md rounded-md p-3 border">
      <div className="text-[10px] text-gray-500 mb-1">Jul 22 – Jul 28, 2025</div>
      <div className="flex items-center gap-2">
        <img src="/images/pk-flag.png" alt="Pakistan" className="w-4 h-4 rounded-sm" /> {/* Replace with flag icon */}
        <span className="font-medium">Pakistan</span>
        <span className="ml-auto font-semibold">1</span>
      </div>
    </div>
  </div>

  {/* Table */}
  <table className="w-full text-sm text-gray-700">
    <thead>
      <tr className="border-b text-xs text-gray-500">
        <th className="text-left py-1">Country</th>
        <th className="text-right py-1">Active Users</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td className="py-1 text-blue-600 font-semibold">Pakistan</td>
        <td className="text-right py-1">1</td>
      </tr>
    </tbody>
  </table>

  {/* Footer */}
  <div className="mt-3 flex justify-between text-xs text-gray-400">
    <span>Last 7 days</span>
    <a href="#" className="text-blue-600 hover:underline">View countries</a>
  </div>
</div>

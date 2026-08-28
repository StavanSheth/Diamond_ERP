import React from 'react';

interface VersionChange {
  fieldPath: string;
  valueBefore: string | null;
  valueAfter: string | null;
}

interface VersionDiffViewProps {
  changes: VersionChange[];
  snapshot: string;
}

export const VersionDiffView: React.FC<VersionDiffViewProps> = ({ changes, snapshot }) => {
  if (!changes || changes.length === 0) {
    return (
      <div className="bg-gray-50 border border-gray-100 rounded p-3 text-xs text-gray-500">
        No specific field changes recorded for this version.
        <div className="mt-2">
          <details>
            <summary className="cursor-pointer text-indigo-600 hover:text-indigo-800">View raw snapshot</summary>
            <pre className="mt-2 p-2 bg-gray-800 text-gray-100 rounded overflow-x-auto text-[10px]">
              {JSON.stringify(JSON.parse(snapshot || '{}'), null, 2)}
            </pre>
          </details>
        </div>
      </div>
    );
  }

  const formatValue = (val: string | null) => {
    if (val === null) return <span className="text-gray-400 italic">null</span>;
    if (val === '""' || val === '') return <span className="text-gray-400 italic">empty</span>;
    // Strip surrounding quotes for strings if present
    const cleanVal = val.replace(/^"|"$/g, '');
    return cleanVal;
  };

  return (
    <div className="bg-white border border-gray-200 rounded overflow-hidden">
      <table className="w-full text-xs text-left">
        <thead className="bg-gray-50 text-gray-500 border-b border-gray-200">
          <tr>
            <th className="px-3 py-2 font-medium">Field</th>
            <th className="px-3 py-2 font-medium">Before</th>
            <th className="px-3 py-2 font-medium">After</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {changes.map((change, i) => (
            <tr key={i} className="hover:bg-gray-50">
              <td className="px-3 py-2 font-mono text-[10px] text-gray-600 truncate max-w-[100px]" title={change.fieldPath}>
                {change.fieldPath}
              </td>
              <td className="px-3 py-2 text-red-700 bg-red-50/30 truncate max-w-[100px]" title={change.valueBefore || ''}>
                {formatValue(change.valueBefore)}
              </td>
              <td className="px-3 py-2 text-green-700 bg-green-50/30 truncate max-w-[100px]" title={change.valueAfter || ''}>
                {formatValue(change.valueAfter)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

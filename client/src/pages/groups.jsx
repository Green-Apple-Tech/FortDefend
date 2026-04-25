import { useState, useEffect, useRef } from 'react';
import { api } from '../lib/api';
import ScriptRunnerModal from '../components/ScriptRunnerModal';

const FolderIcon = ({ open }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill={open ? '#185FA5' : '#6B7280'} className="flex-shrink-0">
    {open
      ? <path d="M2 6a2 2 0 012-2h5l2 2h9a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"/>
      : <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 2h9a2 2 0 012 2v12z"/>}
  </svg>
);

const DeviceIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2" className="flex-shrink-0">
    <rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>
  </svg>
);

const ChevronIcon = ({ open }) => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    className={`flex-shrink-0 transition-transform ${open ? 'rotate-90' : ''}`}>
    <path d="M9 18l6-6-6-6"/>
  </svg>
);

function ContextMenu({ x, y, items, onClose }) {
  const ref = useRef();
  useEffect(() => {
    const handler = () => onClose();
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  return (
    <div ref={ref} className="fixed z-50 bg-white border border-gray-200 rounded shadow-lg py-1 min-w-40"
      style={{ top: y, left: x }}>
      {items.map((item, i) =>
        item === 'divider'
          ? <div key={i} className="border-t border-gray-100 my-1"/>
          : <button key={i} onClick={() => { item.action(); onClose(); }}
              className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 ${item.danger ? 'text-red-600' : 'text-gray-700'}`}>
              {item.label}
            </button>
      )}
    </div>
  );
}

function GroupNode({ group, selectedId, onSelect, onContextMenu, onDrop, depth = 0 }) {
  const [open, setOpen] = useState(depth < 2);
  const [dragOver, setDragOver] = useState(false);
  const hasChildren = group.children && group.children.length > 0;

  return (
    <div>
      <div
        className={`flex items-center gap-1 px-2 py-1.5 rounded cursor-pointer select-none
          ${selectedId === group.id ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-50'}
          ${dragOver ? 'bg-blue-100 ring-2 ring-blue-400' : ''}`}
        style={{ paddingLeft: `${8 + depth * 16}px` }}
        onClick={() => onSelect(group)}
        onContextMenu={(e) => { e.preventDefault(); onContextMenu(e, group); }}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const deviceId = e.dataTransfer.getData('deviceId');
          const fromGroupId = e.dataTransfer.getData('fromGroupId');
          if (deviceId) onDrop(deviceId, fromGroupId, group.id);
        }}
      >
        {hasChildren
          ? <button onClick={(e) => { e.stopPropagation(); setOpen(o => !o); }} className="p-0.5 text-gray-400 hover:text-gray-600">
              <ChevronIcon open={open}/>
            </button>
          : <span className="w-4"/>}
        <FolderIcon open={open && hasChildren}/>
        <span className="text-sm flex-1 truncate">{group.name}</span>
        {group.device_count > 0 &&
          <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">{group.device_count}</span>}
      </div>
      {open && hasChildren && (
        <div>
          {group.children.map(child => (
            <GroupNode key={child.id} group={child} selectedId={selectedId}
              onSelect={onSelect} onContextMenu={onContextMenu} onDrop={onDrop} depth={depth + 1}/>
          ))}
        </div>
      )}
    </div>
  );
}

function DeviceCard({ device, groupId, onRemove }) {
  const handleDragStart = (e) => {
    e.dataTransfer.setData('deviceId', device.id);
    e.dataTransfer.setData('fromGroupId', groupId);
  };

  const statusColor = {
    online: 'bg-green-100 text-green-700',
    offline: 'bg-gray-100 text-gray-500',
    warning: 'bg-yellow-100 text-yellow-700',
    alert: 'bg-red-100 text-red-700',
  }[device.status] || 'bg-gray-100 text-gray-500';

  return (
    <div draggable onDragStart={handleDragStart}
      className="flex items-center gap-3 p-3 bg-white border border-gray-200 rounded-lg hover:border-blue-300 cursor-grab active:cursor-grabbing group">
      <DeviceIcon/>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-gray-800 truncate">{device.name}</div>
        <div className="text-xs text-gray-400">{device.os || 'Unknown OS'}</div>
      </div>
      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor}`}>
        {device.status || 'unknown'}
      </span>
      <button onClick={() => onRemove(device.id)}
        className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-opacity text-lg leading-none">
        ×
      </button>
    </div>
  );
}

export default function Groups({ embedded = false } = {}) {
  const [groups, setGroups] = useState([]);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [devices, setDevices] = useState([]);
  const [allDevices, setAllDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [contextMenu, setContextMenu] = useState(null);
  const [modal, setModal] = useState(null);
  const [modalInput, setModalInput] = useState('');
  const [dragOverUngrouped, setDragOverUngrouped] = useState(false);
  const [scripts, setScripts] = useState([]);
  const [runnerDevices, setRunnerDevices] = useState([]);
  const [showRunner, setShowRunner] = useState(false);

  useEffect(() => { loadGroups(); loadAllDevices(); loadScripts(); }, []);
  useEffect(() => { if (selectedGroup) loadGroupDevices(selectedGroup.id); }, [selectedGroup]);

  async function loadGroups() {
    try {
      const data = await api('/api/groups');
      setGroups(data.groups);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function loadAllDevices() {
    try {
      const data = await api('/api/devices');
      setAllDevices(data.devices || []);
    } catch (err) {
      console.error(err);
    }
  }

  async function loadScripts() {
    const data = await api('/api/scripts').catch(() => ({ scripts: [] }));
    setScripts(Array.isArray(data?.scripts) ? data.scripts : []);
  }

  async function loadGroupDevices(groupId) {
    try {
      const data = await api(`/api/groups/${groupId}/devices`);
      setDevices(data.devices || []);
    } catch (err) {
      console.error(err);
    }
  }

  async function createGroup(name, parentId = null) {
    try {
      await api('/api/groups', { method: 'POST', body: { name, parent_id: parentId } });
      await loadGroups();
    } catch (err) {
      console.error(err);
    }
  }

  async function renameGroup(id, name) {
    try {
      await api(`/api/groups/${id}`, { method: 'PATCH', body: { name } });
      await loadGroups();
      if (selectedGroup?.id === id) setSelectedGroup(g => ({ ...g, name }));
    } catch (err) {
      console.error(err);
    }
  }

  async function deleteGroup(id) {
    if (!confirm('Delete this group? Devices will be unassigned.')) return;
    try {
      await api(`/api/groups/${id}`, { method: 'DELETE' });
      if (selectedGroup?.id === id) setSelectedGroup(null);
      await loadGroups();
    } catch (err) {
      console.error(err);
    }
  }

  async function handleDrop(deviceId, fromGroupId, toGroupId) {
    try {
      await api(`/api/groups/devices/${deviceId}/move`, {
        method: 'POST',
        body: { from_group_id: fromGroupId || null, to_group_id: toGroupId || null },
      });
      await loadGroups();
      if (selectedGroup) await loadGroupDevices(selectedGroup.id);
    } catch (err) {
      console.error(err);
    }
  }

  async function removeDeviceFromGroup(deviceId) {
    try {
      await api(`/api/groups/${selectedGroup.id}/devices/${deviceId}`, { method: 'DELETE' });
      await loadGroupDevices(selectedGroup.id);
      await loadGroups();
    } catch (err) {
      console.error(err);
    }
  }

  function handleContextMenu(e, group) {
    setContextMenu({
      x: e.clientX, y: e.clientY,
      items: [
        { label: '▶️ Run Script on All Devices', action: async () => {
          const data = await api(`/api/groups/${group.id}/devices`).catch(() => ({ devices: [] }));
          const list = Array.isArray(data?.devices) ? data.devices : [];
          setRunnerDevices(list);
          setShowRunner(true);
        } },
        { label: '🔁 Reboot All', action: async () => {
          const data = await api(`/api/groups/${group.id}/devices`).catch(() => ({ devices: [] }));
          const list = Array.isArray(data?.devices) ? data.devices : [];
          for (const d of list) {
            if (d.source !== 'intune') continue;
            await api(`/api/integrations/devices/${encodeURIComponent(d.id)}/reboot`, {
              method: 'POST',
              body: { source: 'intune' },
            }).catch(() => {});
          }
        } },
        { label: '👁️ View Devices', action: async () => { setSelectedGroup(group); } },
        'divider',
        { label: '📁 Add subgroup', action: () => { setModal({ type: 'create', parent: group }); setModalInput(''); } },
        { label: '✏️ Rename', action: () => { setModal({ type: 'rename', group }); setModalInput(group.name); } },
        'divider',
        { label: '🗑️ Delete group', danger: true, action: () => deleteGroup(group.id) },
      ],
    });
  }

  async function handleModalSubmit() {
    if (!modalInput.trim()) return;
    if (modal.type === 'create') {
      await createGroup(modalInput.trim(), modal.parent?.id || null);
    } else if (modal.type === 'rename') {
      await renameGroup(modal.group.id, modalInput.trim());
    }
    setModal(null);
    setModalInput('');
  }

  return (
    <div className={`flex h-full bg-gray-50 ${embedded ? 'min-h-[28rem]' : 'min-h-screen'}`}>
      <div className="w-72 bg-white border-r border-gray-200 flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <h2 className="font-semibold text-gray-800 text-sm">Groups</h2>
          <button onClick={() => { setModal({ type: 'create', parent: null }); setModalInput(''); }}
            className="text-blue-600 hover:text-blue-800 text-xl leading-none font-light" title="New group">+</button>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {loading ? (
            <div className="text-center text-gray-400 text-sm py-8">Loading...</div>
          ) : groups.length === 0 ? (
            <div className="text-center text-gray-400 text-sm py-8">
              No groups yet.<br/>
              <button onClick={() => { setModal({ type: 'create', parent: null }); setModalInput(''); }}
                className="text-blue-500 hover:underline mt-1">Create your first group</button>
            </div>
          ) : (
            groups.map(g => (
              <GroupNode key={g.id} group={g} selectedId={selectedGroup?.id}
                onSelect={setSelectedGroup} onContextMenu={handleContextMenu} onDrop={handleDrop}/>
            ))
          )}
        </div>

        <div
          className={`border-t border-gray-200 p-3 ${dragOverUngrouped ? 'bg-blue-50' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDragOverUngrouped(true); }}
          onDragLeave={() => setDragOverUngrouped(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOverUngrouped(false);
            const deviceId = e.dataTransfer.getData('deviceId');
            const fromGroupId = e.dataTransfer.getData('fromGroupId');
            if (deviceId) handleDrop(deviceId, fromGroupId, null);
          }}
        >
          <div className="text-xs text-gray-400 text-center">Drop here to ungroup</div>
        </div>
      </div>

      <div className="flex-1 p-6">
        {selectedGroup ? (
          <>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h1 className="text-xl font-semibold text-gray-800">{selectedGroup.name}</h1>
                <p className="text-sm text-gray-400">{devices.length} device{devices.length !== 1 ? 's' : ''}</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => { setModal({ type: 'rename', group: selectedGroup }); setModalInput(selectedGroup.name); }}
                  className="text-sm px-3 py-1.5 border border-gray-200 rounded hover:bg-gray-50 text-gray-600">
                  Rename
                </button>
                <button onClick={() => { setModal({ type: 'create', parent: selectedGroup }); setModalInput(''); }}
                  className="text-sm px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700">
                  + Add subgroup
                </button>
              </div>
            </div>

            {devices.length === 0 ? (
              <div className="border-2 border-dashed border-gray-200 rounded-xl p-12 text-center text-gray-400">
                <div className="text-4xl mb-2">📂</div>
                <div className="text-sm">No devices in this group</div>
                <div className="text-xs mt-1">Drag devices here to add them</div>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2 max-w-2xl">
                {devices.map(d => (
                  <DeviceCard key={d.id} device={d} groupId={selectedGroup.id} onRemove={removeDeviceFromGroup}/>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="flex items-center justify-center h-64 text-gray-400">
            <div className="text-center">
              <div className="text-5xl mb-3">📁</div>
              <div className="text-sm">Select a group to view its devices</div>
            </div>
          </div>
        )}
      </div>

      {contextMenu && (
        <ContextMenu x={contextMenu.x} y={contextMenu.y} items={contextMenu.items}
          onClose={() => setContextMenu(null)}/>
      )}

      {modal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-80">
            <h3 className="font-semibold text-gray-800 mb-4">
              {modal.type === 'create'
                ? modal.parent ? `New subgroup in "${modal.parent.name}"` : 'New group'
                : `Rename "${modal.group.name}"`}
            </h3>
            <input autoFocus value={modalInput} onChange={e => setModalInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleModalSubmit(); if (e.key === 'Escape') setModal(null); }}
              placeholder="Group name" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4"/>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setModal(null)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-lg">Cancel</button>
              <button onClick={handleModalSubmit} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                {modal.type === 'create' ? 'Create' : 'Rename'}
              </button>
            </div>
          </div>
        </div>
      )}
      <ScriptRunnerModal
        open={showRunner}
        onClose={() => setShowRunner(false)}
        scripts={scripts}
        selectedDevices={runnerDevices}
        title="Run Script on Group Devices"
      />
    </div>
  );
}
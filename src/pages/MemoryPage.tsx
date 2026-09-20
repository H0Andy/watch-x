import { useState } from 'react'
import type { MetricsSnapshot } from '../shared/types'
import type { MemoryModuleIdentity, MemoryTimingProfile, SpdAvailability } from '../shared/hardware'
import {
  formatProfileSpeed,
  formatTimingTriplet,
  formatVoltage,
} from '../shared/ddr5SpdProfiles'
import { formatBytes, formatPercent, hwSourceLabel, hwText, usageTone } from '../lib/format'
import { Kv, Metric, Panel } from '../components/ui'

function speedLabel(module: MemoryModuleIdentity): string | null {
  const mhz = module.configuredClockSpeedMhz.value ?? module.clockSpeedMhz.value
  if (mhz == null) return null
  return `${mhz} MT/s`
}

function spdStatusLabel(status: SpdAvailability | undefined): string {
  switch (status) {
    case 'available':
      return 'SPD 高级识别 · 可用'
    case 'permission-required':
      return 'SPD 高级识别 · 需要管理员权限'
    case 'busy':
      return 'SPD 高级识别 · 当前 SMBus 被其他程序占用'
    case 'unsupported':
      return 'SPD 高级识别 · 当前平台不支持'
    case 'read-error':
      return 'SPD 高级识别 · 读取失败'
    case 'unavailable':
      return 'SPD 高级识别 · 不可用'
    case 'not-attempted':
      return 'SPD 高级识别 · 尚未扫描'
    default:
      return 'SPD 高级识别 · 未知'
  }
}

function FieldRow({
  label,
  value,
  source,
}: {
  label: string
  value: string
  source?: string
}) {
  return (
    <div className="hw-field-row">
      <span className="hw-field-label">{label}</span>
      <span className="hw-field-value">{value}</span>
      <span className="hw-field-source">{source ?? ''}</span>
    </div>
  )
}

function ProfileBlock({ title, profiles, emptyText }: { title: string; profiles: MemoryTimingProfile[]; emptyText: string }) {
  return (
    <div className="hw-profile-block">
      <div className="hw-profile-heading">{title}</div>
      {profiles.length === 0 ? (
        <p className="hw-empty-inline">{emptyText}</p>
      ) : (
        profiles.map((p, i) => (
          <div key={`${p.type}-${p.index ?? i}`} className="hw-profile-card">
            <div className="hw-profile-name">
              {p.name || (p.index != null ? `Profile ${p.index}` : title)}
              <span className="hw-field-source">SPD</span>
            </div>
            <div className="hw-profile-facts">
              <span>{formatProfileSpeed(p)}</span>
              <span>{formatTimingTriplet(p)}</span>
              {p.voltageMv != null ? <span>{formatVoltage(p.voltageMv)}</span> : null}
            </div>
          </div>
        ))
      )}
    </div>
  )
}

function ModuleCard({ module, index }: { module: MemoryModuleIdentity; index: number }) {
  const [open, setOpen] = useState(index === 0)
  const slot = module.locator || module.bank || `模组 ${index + 1}`
  const title = `${hwText(module.manufacturer)} ${hwText(module.partNumber)}`
  const hasSpd = module.spd != null
  const reportedSpeed = speedLabel(module)

  return (
    <div className={`hw-module ${open ? 'is-open' : ''}`}>
      <button type="button" className="hw-module-summary" onClick={() => setOpen((v) => !v)}>
        <div className="hw-module-title">
          <strong>{slot}</strong>
          <span>{title}</span>
        </div>
        <div className="hw-module-facts">
          {module.capacityBytes.value != null ? <span>{formatBytes(module.capacityBytes.value)}</span> : null}
          {module.type.value ? <span>{hwText(module.type)}</span> : null}
          {reportedSpeed ? <span>{reportedSpeed}</span> : null}
          {module.dramManufacturer.value ? (
            <span title="DRAM 颗粒厂商 (SPD)">{hwText(module.dramManufacturer)}</span>
          ) : null}
        </div>
        <em>{open ? '收起' : '详情'}</em>
      </button>

      {open ? (
        <div className="hw-module-detail">
          <h4 className="hw-section-title">模组信息</h4>
          <div className="hw-field-list">
            {module.manufacturer.value ? (
              <FieldRow
                label="模组厂商"
                value={hwText(module.manufacturer)}
                source={hwSourceLabel(module.manufacturer.source)}
              />
            ) : null}
            {module.partNumber.value ? (
              <FieldRow
                label="Part Number"
                value={hwText(module.partNumber)}
                source={hwSourceLabel(module.partNumber.source)}
              />
            ) : null}
            {module.serialNumber.value ? (
              <FieldRow
                label="序列号"
                value={hwText(module.serialNumber)}
                source={hwSourceLabel(module.serialNumber.source)}
              />
            ) : null}
            {module.capacityBytes.value != null ? (
              <FieldRow
                label="容量"
                value={formatBytes(module.capacityBytes.value)}
                source={hwSourceLabel(module.capacityBytes.source)}
              />
            ) : null}
            {module.type.value ? (
              <FieldRow label="类型" value={hwText(module.type)} source={hwSourceLabel(module.type.source)} />
            ) : null}
            {reportedSpeed ? <FieldRow label="报告速度" value={reportedSpeed} source="SMBIOS" /> : null}
          </div>

          {hasSpd ? (
            <>
              <h4 className="hw-section-title">SPD 信息</h4>
              <div className="hw-field-list">
                {module.spdRevision.value ? (
                  <FieldRow label="SPD Revision" value={hwText(module.spdRevision)} source="SPD" />
                ) : null}
                {module.dramManufacturer.value ? (
                  <FieldRow label="DRAM 颗粒厂商" value={hwText(module.dramManufacturer)} source="SPD" />
                ) : null}
                {module.rankLabel.value ? (
                  <FieldRow label="Rank" value={hwText(module.rankLabel)} source="SPD" />
                ) : null}
                {module.spd?.spdSize.value != null ? (
                  <FieldRow label="SPD Size" value={`${module.spd.spdSize.value} bytes`} source="SPD" />
                ) : null}
                {module.spd?.spdAddress.value ? (
                  <FieldRow label="SPD 地址" value={hwText(module.spd.spdAddress)} source="SPD" />
                ) : null}
              </div>

              <h4 className="hw-section-title">支持的配置（SPD 广告，非当前运行）</h4>
              <div className="hw-profile-list">
                <ProfileBlock title="JEDEC" profiles={module.jedecProfiles} emptyText="未解析到 JEDEC 配置" />
                <div className="hw-profile-block">
                  <div className="hw-profile-heading">
                    Intel XMP
                    {module.xmpVersion.value ? (
                      <span className="hw-profile-meta">版本 {hwText(module.xmpVersion)}</span>
                    ) : null}
                  </div>
                  {module.xmpProfiles.length === 0 ? (
                    <p className="hw-empty-inline">未检测到</p>
                  ) : (
                    module.xmpProfiles.map((p, i) => (
                      <div key={`xmp-${p.index ?? i}`} className="hw-profile-card">
                        <div className="hw-profile-name">
                          {p.name || `Profile ${p.index ?? i + 1}`}
                          <span className="hw-field-source">SPD</span>
                        </div>
                        <div className="hw-profile-facts">
                          <span>{formatProfileSpeed(p)}</span>
                          <span>{formatTimingTriplet(p)}</span>
                          {p.voltageMv != null ? <span>{formatVoltage(p.voltageMv)}</span> : null}
                        </div>
                      </div>
                    ))
                  )}
                </div>
                <ProfileBlock title="AMD EXPO" profiles={module.expoProfiles} emptyText="未检测到" />
              </div>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

export function MemoryPage({ metrics }: { metrics: MetricsSnapshot }) {
  const { memory, hardwareIdentity } = metrics
  const modules = hardwareIdentity?.memoryModules ?? []
  const spdStatus = hardwareIdentity?.spdStatus

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="grid cols-3">
        <Panel title="物理内存">
          <Metric
            value={formatPercent(memory.usagePercent, 1)}
            label={`${formatBytes(memory.usedBytes)} / ${formatBytes(memory.totalBytes)}`}
            tone={usageTone(memory.usagePercent)}
            percent={memory.usagePercent}
          />
        </Panel>
        <Panel title="可用">
          <Metric value={formatBytes(memory.availableBytes)} label={`空闲 ${formatBytes(memory.freeBytes)}`} tone="ok" />
        </Panel>
        <Panel title="交换分区">
          <Metric
            value={memory.swapTotalBytes > 0 ? formatPercent(memory.swapPercent, 0) : '无'}
            label={
              memory.swapTotalBytes > 0
                ? `${formatBytes(memory.swapUsedBytes)} / ${formatBytes(memory.swapTotalBytes)}`
                : '未启用'
            }
            tone={usageTone(memory.swapPercent)}
            percent={memory.swapTotalBytes > 0 ? memory.swapPercent : null}
          />
        </Panel>
      </div>

      <Panel
        title="内存模组"
        sub={
          hardwareIdentity
            ? `已识别 ${modules.length} 根 · ${spdStatusLabel(spdStatus)}${
                hardwareIdentity.spdStatusDetail ? ` · ${hardwareIdentity.spdStatusDetail}` : ''
              }`
            : '硬件身份采集中…'
        }
      >
        {modules.length === 0 ? (
          <p className="hw-empty">
            {hardwareIdentity ? '暂未读取到内存模组信息（SMBIOS 可能不可用）。' : '正在读取硬件身份…'}
          </p>
        ) : (
          <div className="hw-module-list">
            {modules.map((module, index) => (
              <ModuleCard
                key={`${module.serialNumber.value || module.partNumber.value || index}`}
                module={module}
                index={index}
              />
            ))}
          </div>
        )}
      </Panel>

      <Panel title="运行时分解" sub="Windows 缓存含 Standby + Cache · 实时监控">
        <Kv
          rows={[
            ['已用', formatBytes(memory.usedBytes)],
            ['活跃', formatBytes(memory.activeBytes)],
            ['缓存 / Standby', formatBytes(memory.cachedBytes)],
            ['缓冲+缓存', formatBytes(memory.buffcacheBytes)],
            ['空闲', formatBytes(memory.freeBytes)],
            ['可用', formatBytes(memory.availableBytes)],
            ['交换已用', formatBytes(memory.swapUsedBytes)],
            ['交换总量', formatBytes(memory.swapTotalBytes)],
          ]}
        />
      </Panel>
    </div>
  )
}

import { describe, expect, it } from 'vitest'
import { getMermaidFilename, getMermaidHash, renderMermaid } from '../src/mermaid/render.js'

describe('Mermaid ELK rendering', () => {
  const NESTED_SUBGRAPH_DIAGRAM = `
flowchart TB
    subgraph VPC["VPC"]
        subgraph AZ1["AZ 1"]
            ECS1["ECS"]
            RDS1["RDS"]
        end
        subgraph AZ2["AZ 2"]
            ECS2["ECS"]
        end
    end
    ECS1 --> RDS1
    ECS2 --> RDS1
`

  it('renders mermaid diagram to PNG', async () => {
    const png = await renderMermaid(NESTED_SUBGRAPH_DIAGRAM)

    // Check PNG magic bytes
    expect(png[0]).toBe(0x89)
    expect(png[1]).toBe(0x50) // P
    expect(png[2]).toBe(0x4e) // N
    expect(png[3]).toBe(0x47) // G

    // PNG should be reasonably sized (4x scale = large)
    expect(png.length).toBeGreaterThan(10000)
  })

  it('uses ELK layout (not dagre) - regression test', async () => {
    // This is the KNOWN BAD hash when ELK is broken and falls back to dagre
    // If this test fails with hash matching DAGRE_HASH, ELK is broken!
    const DAGRE_HASH = '10c7da434ecdf8c6583a8454f94e9d71'

    const png = await renderMermaid(NESTED_SUBGRAPH_DIAGRAM)

    // Compute MD5 hash of rendered PNG
    const { createHash } = await import('node:crypto')
    const hash = createHash('md5').update(png).digest('hex')

    // Hash MUST differ from dagre fallback
    expect(hash).not.toBe(DAGRE_HASH)
  })

  it('renders complex diagram with edge labels', async () => {
    const diagram = `
flowchart TB
    subgraph VPC["VPC: Production"]
        subgraph AZ1["Availability Zone 1"]
            ECS1["ECS Service"]
            RDS1["RDS Primary"]
        end
        subgraph AZ2["Availability Zone 2"]
            ECS2["ECS Service"]
            RDS2["RDS Replica"]
        end
    end
    Internet([Internet]) --> LB[Load Balancer]
    LB --> ECS1
    LB --> ECS2
    ECS1 -->|PostgreSQL| RDS1
    ECS2 -->|PostgreSQL| RDS1
    RDS1 -.->|Replication| RDS2
`
    const png = await renderMermaid(diagram)

    // Should render without errors
    expect(png.length).toBeGreaterThan(50000) // Complex diagram = larger PNG
  })

  it('generates consistent hashes for same input', () => {
    const code = 'flowchart TB\n    A --> B'
    const hash1 = getMermaidHash(code)
    const hash2 = getMermaidHash(code)

    expect(hash1).toBe(hash2)
    expect(hash1).toHaveLength(12)
  })

  it('generates correct filename format', () => {
    const code = 'flowchart TB\n    A --> B'
    const filename = getMermaidFilename(code)

    expect(filename).toMatch(/^mermaid-[a-f0-9]{12}\.png$/)
  })

  // Note: sequence/state diagrams don't work with isomorphic-mermaid (svgdom limitations)
  // flowcharts with ELK are our primary use case

  it('does not crop tall diagrams - regression test for missing height attribute', async () => {
    // This diagram has many nested subgraphs and is tall
    // Previously mermaid didn't set height on <svg>, causing cropping
    const tallDiagram = `
flowchart TB
    subgraph Internet["Internet"]
        Marqeta["Marqeta API"]
        Datadog["Datadog"]
    end
    subgraph VPC["VPC"]
        subgraph AZ1["AZ 1"]
            ECS1["ECS"]
            RDS1["RDS"]
        end
        subgraph AZ2["AZ 2"]
            ECS2["ECS"]
            RDS2["RDS"]
        end
        subgraph AZ3["AZ 3"]
            ECS3["ECS"]
        end
        NAT["NAT Gateway"]
        IGW["Internet Gateway"]
    end
    Marqeta --> VPC
    Datadog --> VPC
    ECS1 --> RDS1
    ECS2 --> RDS2
    ECS3 --> RDS1
    NAT --> IGW
    IGW --> Internet
`
    const png = await renderMermaid(tallDiagram)

    // Parse PNG dimensions from IHDR chunk (bytes 16-23)
    // PNG structure: 8-byte signature, then IHDR chunk with width (4 bytes) and height (4 bytes)
    const width = png.readUInt32BE(16)
    const height = png.readUInt32BE(20)

    // With 4x scale, dimensions should be substantial
    // Before the fix: mermaid didn't set height on <svg>, resvg used wrong height
    // This diagram should be roughly square (aspect ratio ~0.97)
    // Height should be >2500px with 4x scale (original ~687px from viewBox)
    expect(height).toBeGreaterThan(2500)
    expect(width).toBeGreaterThan(2500)

    // Key check: PNG file should be substantial (cropped = fewer pixels = smaller file)
    expect(png.length).toBeGreaterThan(80000)
  })
})

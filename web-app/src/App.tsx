
import React, { useState, useRef, useMemo, useEffect } from "react";
import {
  Button,
  Table,
  Upload,
  message,
  Input,
  Form,
  Radio,
  Modal,
  Slider,
  Progress,
  Select,
  ColorPicker,
  Layout,
  Typography,
  Tag,
  Tooltip,
  Badge,
  Space
} from "antd";
import {
  UploadOutlined,
  DownloadOutlined,
  PlusOutlined,
  DeleteOutlined,
  QrcodeOutlined,
  FileExcelOutlined,
  SearchOutlined
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import * as XLSX from "xlsx";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import QRCodeStyling from "qr-code-styling";
import "./App.css";

import Mlogo from "./assets/logo.png";
import Bg1 from "./assets/bg.png";
// import Bg2 from "./assets/bg.png";
// import Bg3 from "./assets/bg.png";

const { Content } = Layout;
const { Title, Text } = Typography;

// ---------- Типы ----------
interface RowData {
  key: string;
  name?: string;
  number?: string;
  qr?: string;
  qrBlob?: Blob;
  mergedBlob?: Blob;
  _link: string;
  [key: string]: any;
}

interface PositionPct {
  xPct: number;
  yPct: number;
}

interface TextOverlay {
  id: string;
  text: string;
  color: string;
  fontSize: number;
  position: PositionPct;
  fontFamily: string;
  columnSource?: string;
  isDynamic: boolean;
  letterSpacing?: number;
}

// ---------- Константы ----------
const modalSize = 490;


// ---------- Компонент ----------
const App: React.FC = () => {
  // ---------- Вспомогательные функции (внутри для доступа к стейту/контексту если надо) ----------
  const generateQrPng = async (data: string, centerImageUrl?: string) => {
    const qr = new QRCodeStyling({
      width: 2000,
      height: 2000,
      data,
      dotsOptions: {
        type: "rounded",
        gradient: {
          type: "linear",
          rotation: 1.5708,
          colorStops: [
            { offset: 0, color: "#12944C" },
            { offset: 1, color: "#1E6E72" },
          ],
        },
      },
      cornersSquareOptions: { type: "extra-rounded" },
      cornersDotOptions: { type: "extra-rounded" },
      backgroundOptions: { color: "#ffffff00" },
      image: centerImageUrl || Mlogo,
      imageOptions: { crossOrigin: "anonymous", margin: 20, imageSize: 0.28 },
    });
    const blob = await qr.getRawData("png");
    return blob as Blob;
  };

  const [data, setData] = useState<RowData[]>([]);
  const [columns, setColumns] = useState<any[]>([]);
  const [form] = Form.useForm();
  const [selectedRow, setSelectedRow] = useState<RowData | null>(null);
  const [downloadModalVisible, setDownloadModalVisible] = useState(false);
  const [allModalVisible, setAllModalVisible] = useState(false);
  const [qrPosPct, setQrPosPct] = useState<PositionPct>({ xPct: 0.2, yPct: 0.2 });
  const [qrSizePct, setQrSizePct] = useState<number>(0.18);
  const [selectedBg, setSelectedBg] = useState<string>(Bg1);
  const [userBg, setUserBg] = useState<string | null>(null);
  const [isGeneratingAll, setIsGeneratingAll] = useState(false);
  const [generatedQrs, setGeneratedQrs] = useState<Record<string, Blob>>({});
  const [progress, setProgress] = useState<number>(0);
  const [searchText, setSearchText] = useState("");
  const [saveColumns] = useState<string[]>([]);
  const [customNamePattern, setCustomNamePattern] = useState<string>("{name}");

  const [textOverlays, setTextOverlays] = useState<TextOverlay[]>([]);
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null);
  const [bgDimensions, setBgDimensions] = useState({ width: 0, height: 0 });

  // Update background dimensions when selectedBg or userBg changes
  useEffect(() => {
    const bg = selectedBg === "user" && userBg ? userBg : selectedBg;
    if (!bg) return;

    const img = new Image();
    img.onload = () => {
      setBgDimensions({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.src = bg;
  }, [selectedBg, userBg]);

  const previewWidth = useMemo(() => {
    if (!bgDimensions.width || !bgDimensions.height) return modalSize;
    const aspect = bgDimensions.width / bgDimensions.height;
    if (aspect > 1) return modalSize;
    return modalSize * aspect;
  }, [bgDimensions]);

  const previewHeight = useMemo(() => {
    if (!bgDimensions.width || !bgDimensions.height) return modalSize;
    const aspect = bgDimensions.width / bgDimensions.height;
    if (aspect > 1) return modalSize / aspect;
    return modalSize;
  }, [bgDimensions]);

  const containerRef = useRef<HTMLDivElement | null>(null);

  const bgTemplates = [
    { label: "Фон 1", value: Bg1 },
    { label: "Свой фон", value: "user" },
  ];

  const availableColumns = useMemo(() => {
    return columns
      .filter(col => col.dataIndex && !['qr', 'status', 'actions'].includes(col.dataIndex))
      .map(col => ({
        label: col.title || col.dataIndex,
        value: col.dataIndex
      }));
  }, [columns]);

  const getFileName = (row: RowData) => {
    let result = customNamePattern.trim();

    if (result) {
      // Replace system fields
      const systemFields = ['_link', 'name', 'number'];
      systemFields.forEach(field => {
        const placeholder = field === '_link' ? 'ID' : field;
        result = result.replaceAll(`{${field}}`, String(row[field] || ''));
        if (placeholder !== field) {
          result = result.replaceAll(`{${placeholder}}`, String(row[field] || ''));
        }
      });

      // Replace dynamic Excel columns by label
      availableColumns.forEach(col => {
        result = result.replaceAll(`{${col.label}}`, String(row[col.value] || ''));
      });

      // Also support internal keys as fallback
      Object.keys(row).forEach(key => {
        if (key.startsWith('col_')) {
          result = result.replaceAll(`{${key}}`, String(row[key] || ''));
        }
      });

      return result.replace(/[<>:"/\\|?*]+/g, "_") || row.key;
    }

    if (saveColumns.length) {
      return saveColumns
        .map((col) => row[col])
        .filter(Boolean)
        .join("_") || row._link || row.key;
    }
    return row.name || row._link || row.key;
  };

  const addTextOverlay = () => {
    const newOverlay: TextOverlay = {
      id: Date.now().toString(),
      text: "Ваш текст",
      color: "#ffffff",
      fontSize: 24,
      fontFamily: "Arial",
      position: { xPct: 0.5, yPct: 0.1 },
      isDynamic: false,
      letterSpacing: 0
    };
    setTextOverlays([...textOverlays, newOverlay]);
    setSelectedTextId(newOverlay.id);
  };

  const updateTextOverlay = (id: string, updates: Partial<TextOverlay>) => {
    setTextOverlays(textOverlays.map(overlay =>
      overlay.id === id ? { ...overlay, ...updates } : overlay
    ));
  };

  const deleteTextOverlay = (id: string) => {
    setTextOverlays(textOverlays.filter(overlay => overlay.id !== id));
    if (selectedTextId === id) {
      setSelectedTextId(null);
    }
  };

  const handleTextDrag = (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const overlay = textOverlays.find(t => t.id === id);
    if (!overlay) return;

    const startLeft = overlay.position.xPct * previewWidth;
    const startTop = overlay.position.yPct * previewHeight;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;
      let newX = (startLeft + dx) / previewWidth;
      let newY = (startTop + dy) / previewHeight;
      newX = Math.min(Math.max(0, newX), 1);
      newY = Math.min(Math.max(0, newY), 1);
      updateTextOverlay(id, { position: { xPct: newX, yPct: newY } });
    };

    const onMouseUp = () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  };

  const handleQrDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;

    const currentPreviewLeft = qrPosPct.xPct * previewWidth;
    const currentPreviewTop = qrPosPct.yPct * previewHeight;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;

      setQrPosPct({
        xPct: (currentPreviewLeft + dx) / previewWidth,
        yPct: (currentPreviewTop + dy) / previewHeight,
      });
    };

    const onMouseUp = () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  };

  const getDisplayText = (overlay: TextOverlay, row?: RowData | null) => {
    if (overlay.isDynamic && overlay.columnSource && row) {
      return row[overlay.columnSource] || `{${overlay.columnSource}}`;
    }
    return overlay.text;
  };

  const handleFileUpload = async (file: File) => {
    try {
      const reader = new FileReader();
      reader.onload = (e) => {
        const bstr = e.target?.result;
        if (!bstr) return;
        const workbook = XLSX.read(bstr, { type: "binary" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
        if (!rows.length) return;

        const cols: any[] = rows[0].slice(1).map((h, idx) => ({
          title: h,
          dataIndex: `col_${idx}`,
          key: `col_${idx}`,
          editable: true,
        }));

        const tableData: RowData[] = [];
        for (let i = 1; i < rows.length; i++) {
          const row = rows[i];
          const obj: RowData = { key: String(i), _link: row[0], name: row[1], number: row[2] };
          row.slice(1).forEach((val, idx) => {
            obj[`col_${idx}`] = val;
          });
          tableData.push(obj);
        }

        setColumns(cols);
        setData(tableData);
        message.success("Файл загружен");
      };
      reader.readAsBinaryString(file);
    } catch {
      message.error("Ошибка при загрузке файла");
    }
    return false;
  };

  const filteredData = useMemo(() => {
    if (!searchText) return data;
    const lower = searchText.toLowerCase();
    return data.filter((row) =>
      Object.keys(row)
        .filter((k) => !["qr", "qrBlob", "mergedBlob", "key"].includes(k))
        .some((key) => String(row[key] ?? "").toLowerCase().includes(lower))
    );
  }, [data, searchText]);

  const openSingleModal = async (record: RowData) => {
    setSelectedRow(record);
    if (!record.qrBlob) {
      try {
        const blob = await generateQrPng(record._link);
        const url = URL.createObjectURL(blob);
        setData((prev) => prev.map((r) => (r.key === record.key ? { ...r, qrBlob: blob, qr: url } : r)));
        setSelectedRow({ ...record, qrBlob: blob, qr: url });
      } catch {
        message.error("Не удалось сгенерировать QR");
        return;
      }
    }
    setDownloadModalVisible(true);
  };

  const qrSidePreview = previewWidth * qrSizePct;
  const previewLeft = qrPosPct.xPct * previewWidth;
  const previewTop = qrPosPct.yPct * previewHeight;

  const mergeQrWithBackground = async (
    qrBlob: Blob,
    bgSrc: string,
    posPct: PositionPct,
    qrSizePct: number,
    textOverlays: TextOverlay[] = [],
    rowData?: RowData
  ) => {
    const bgImg = new Image();
    const qrImg = new Image();
    bgImg.crossOrigin = "anonymous";
    qrImg.crossOrigin = "anonymous";

    return new Promise<Blob>((resolve, reject) => {
      bgImg.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = bgImg.naturalWidth;
        canvas.height = bgImg.naturalHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Canvas not supported"));

        ctx.drawImage(bgImg, 0, 0);

        qrImg.onload = () => {
          const targetSize = canvas.width * qrSizePct;
          const drawX = (posPct.xPct * canvas.width) - (targetSize / 2);
          const drawY = (posPct.yPct * canvas.height) - (targetSize / 2);

          ctx.drawImage(qrImg, drawX, drawY, targetSize, targetSize);

          textOverlays.forEach(overlay => {
            let displayText = overlay.text;
            if (overlay.isDynamic && overlay.columnSource && rowData) {
              displayText = rowData[overlay.columnSource] || overlay.text;
            }

            const currentScaleRatio = canvas.width / previewWidth;
            const scaledFontSize = overlay.fontSize * currentScaleRatio;
            const scaledLetterSpacing = (overlay.letterSpacing || 0) * currentScaleRatio;

            ctx.fillStyle = overlay.color;
            ctx.font = `bold ${scaledFontSize}px "${overlay.fontFamily}"`;

            if ('letterSpacing' in ctx) {
              (ctx as any).letterSpacing = `${scaledLetterSpacing}px`;
            }
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";

            const textX = overlay.position.xPct * canvas.width;
            const textY = overlay.position.yPct * canvas.height;

            // Apply shadow with same scaling
            ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
            ctx.shadowBlur = 4 * currentScaleRatio;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 2 * currentScaleRatio;

            ctx.fillText(displayText, textX, textY);

            // Reset shadow
            ctx.shadowColor = 'transparent';
            ctx.shadowBlur = 0;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;
            if ('letterSpacing' in ctx) {
              (ctx as any).letterSpacing = '0px';
            }
          });

          canvas.toBlob(
            (blob) => {
              if (blob) resolve(blob);
              else reject(new Error("Failed to create blob"));
            },
            "image/png",
            1
          );
        };
        qrImg.onerror = reject;
        qrImg.src = URL.createObjectURL(qrBlob);
      };
      bgImg.onerror = reject;
      bgImg.src = bgSrc;
    });
  };

  const handleDownloadOne = async () => {
    if (!selectedRow || !selectedRow.qrBlob) return;
    try {
      const bg = selectedBg === "user" && userBg ? userBg : selectedBg;
      const mergedBlob = await mergeQrWithBackground(selectedRow.qrBlob, bg!, qrPosPct, qrSizePct, textOverlays, selectedRow);
      saveAs(mergedBlob, `${getFileName(selectedRow)}.png`);
      setData((prev) => prev.map((r) => (r.key === selectedRow.key ? { ...r, mergedBlob } : r)));
      setDownloadModalVisible(false);
      message.success("QR сохранен!");
    } catch {
      message.error("Ошибка при создании изображения");
    }
  };

  const generateAllQrs = async () => {
    if (!data.length) return message.error("Нет данных");
    setIsGeneratingAll(true);
    setProgress(0);

    const newGenerated: Record<string, Blob> = {};

    try {
      for (let i = 0; i < data.length; i++) {
        const row = data[i];
        if (!row.qrBlob) {
          try {
            const b = await generateQrPng(row._link);
            row.qrBlob = b;
            row.qr = URL.createObjectURL(b);
          } catch {
            continue;
          }
        }
        try {
          const bg = selectedBg === "user" && userBg ? userBg : selectedBg;
          const mergedBlob = await mergeQrWithBackground(row.qrBlob, bg!, qrPosPct, qrSizePct, textOverlays, row);
          newGenerated[row.key] = mergedBlob;
          row.mergedBlob = mergedBlob;
        } catch (err) {
          console.warn(err);
        }
        setProgress(Math.round(((i + 1) / data.length) * 100));
      }
      setGeneratedQrs(newGenerated); // eslint-disable-line @typescript-eslint/no-unused-vars
      setData([...data]);
      message.success(`Сгенерировано ${Object.keys(newGenerated).length} изображений`);
    } finally {
      setIsGeneratingAll(false);
      setAllModalVisible(false);
    }
  };

  const downloadAllZip = async () => {
    if (!Object.keys(generatedQrs).length) {
      return message.info("Сначала нажмите 'Сгенерировать все'");
    }
    try {
      const zip = new JSZip();
      const usedNames = new Set<string>();

      data.forEach((row) => {
        const blob = generatedQrs[row.key] || row.mergedBlob;
        if (!blob) return;

        let baseName = getFileName(row);
        let name = `${baseName}.png`;
        let counter = 1;

        while (usedNames.has(name)) {
          name = `${baseName}_${counter}.png`;
          counter++;
        }

        usedNames.add(name);
        zip.file(name, blob);
      });
      const content = await zip.generateAsync({ type: "blob" });
      saveAs(content, "All_QR.zip");
      message.success("ZIP скачан");
    } catch {
      message.error("Ошибка при создании архива");
    }
  };

  // Define fixed columns
  const tableColumns: ColumnsType<RowData> = [
    // Data columns first
    ...columns.map((col: any) => ({
      ...col,
      onCell: (record: RowData) => ({ record, dataIndex: col.dataIndex }),
    })),
    // Status Column
    {
      title: 'Статус',
      key: 'status',
      width: 150,
      render: (_, record) => (
        record.qr ? (
          <Tag color="success" icon={<QrcodeOutlined />}>Сгенерирован</Tag>
        ) : (
          <Tag color="default">Не сгенерирован</Tag>
        )
      )
    },
    // QR Preview Column
    {
      title: 'QR',
      key: 'qr_preview',
      width: 60,
      align: 'center',
      render: (_, record) => (
        record.qr ? (
          <div className="qr-preview-cell" onClick={() => openSingleModal(record)}>
            <img src={record.qr} alt="qr" className="qr-preview-img" />
          </div>
        ) : (
          <Text type="secondary" style={{ fontSize: 12 }}>—</Text>
        )
      )
    },
    // Actions Column
    {
      title: 'Действия',
      key: 'actions',
      width: 140,
      fixed: 'right',
      render: (_, record) => (
        record.qr ? (
          <Button
            type="primary"
            ghost
            size="middle"
            icon={<DownloadOutlined />}
            onClick={() => openSingleModal(record)}
          >
            Скачать
          </Button>
        ) : (
          <Button
            size="middle"
            onClick={async () => {
              try {
                const qrBlob = await generateQrPng(record._link);
                const qrUrl = URL.createObjectURL(qrBlob);
                setData((prev) => prev.map((r) => (r.key === record.key ? { ...r, qrBlob, qr: qrUrl } : r)));
                message.success("QR сгенерирован");
              } catch {
                message.error("Ошибка");
              }
            }}
          >
            Создать
          </Button>
        )
      )
    }
  ];

  /* 
    REUSABLE EDITOR COMPONENT RENDERER 
    Accepts a 'previewRow' to show data.
  */
  const renderEditorContent = (previewRow: RowData | null) => (
    <div style={{ display: "flex", gap: 24, padding: '20px 0' }}>
      {/* Settings Panel */}
      <div style={{ flex: '0 0 320px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Background Selection */}
        <div className="settings-block">
          <Text strong style={{ display: 'block', marginBottom: 8 }}>Выберите фон</Text>
          <Radio.Group
            value={selectedBg}
            onChange={(e) => setSelectedBg(e.target.value)}
            style={{ width: '100%' }}
          >
            <Space direction="vertical" style={{ width: '100%' }}>
              {bgTemplates.map((bg) => (
                <Radio key={bg.value} value={bg.value} style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #f0f0f0',
                  borderRadius: 6,
                  background: selectedBg === bg.value ? '#f6ffed' : 'transparent',
                  borderColor: selectedBg === bg.value ? '#b7eb8f' : '#f0f0f0'
                }}>
                  {bg.label}
                </Radio>
              ))}
            </Space>
          </Radio.Group>
          {selectedBg === "user" && (
            <Upload
              accept="image/*"
              showUploadList={false}
              beforeUpload={(file) => {
                const url = URL.createObjectURL(file);
                setUserBg(url);
                return false;
              }}
            >
              <Button block style={{ marginTop: 8 }} icon={<UploadOutlined />}>Загрузить свой фон</Button>
            </Upload>
          )}
        </div>

        {/* QR Size */}
        <div className="settings-block">
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <Text strong>Размер QR</Text>
            <Text type="secondary">{(qrSizePct * 100).toFixed(0)}%</Text>
          </div>
          <Slider min={0.05} max={0.8} step={0.01} value={qrSizePct} onChange={setQrSizePct} />
        </div>

        {/* Text Overlays */}
        <div className="settings-block" style={{ flex: 1, overflowY: 'auto' }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <Text strong>Текст на изображении</Text>
            <Button
              type="dashed"
              size="small"
              icon={<PlusOutlined />}
              onClick={addTextOverlay}
            >
              Добавить
            </Button>
          </div>

          {textOverlays.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 20, background: '#fafafa', borderRadius: 6 }}>
              <Text type="secondary" style={{ fontSize: 13 }}>Нет текстовых слоев</Text>
            </div>
          ) : (
            textOverlays.map((overlay) => (
              <div
                key={overlay.id}
                style={{
                  padding: 12,
                  marginBottom: 8,
                  border: selectedTextId === overlay.id ? '1px solid #1890ff' : '1px solid #e8e8e8',
                  borderRadius: 6,
                  cursor: 'pointer',
                  backgroundColor: selectedTextId === overlay.id ? '#e6f7ff' : '#fff',
                  transition: 'all 0.2s'
                }}
                onClick={() => setSelectedTextId(overlay.id)}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <Text ellipsis style={{ maxWidth: 220, fontWeight: 500 }}>
                    {overlay.isDynamic && overlay.columnSource ? `[${overlay.columnSource}]` : overlay.text}
                  </Text>
                  <Button
                    type="text"
                    danger
                    size="small"
                    icon={<DeleteOutlined />}
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteTextOverlay(overlay.id);
                    }}
                  />
                </div>

                {selectedTextId === overlay.id && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <Radio.Group
                      size="small"
                      value={overlay.isDynamic ? 'dynamic' : 'static'}
                      onChange={(e) => {
                        const isDynamic = e.target.value === 'dynamic';
                        updateTextOverlay(overlay.id, {
                          isDynamic,
                          text: isDynamic ? '' : 'Ваш текст'
                        });
                      }}
                      optionType="button"
                      buttonStyle="solid"
                    >
                      <Radio.Button value="static">Текст</Radio.Button>
                      <Radio.Button value="dynamic" disabled={availableColumns.length === 0}>Данные</Radio.Button>
                    </Radio.Group>

                    {overlay.isDynamic ? (
                      <Select
                        value={overlay.columnSource}
                        onChange={(value) => updateTextOverlay(overlay.id, { columnSource: value })}
                        placeholder="Выберите колонку"
                        size="small"
                        style={{ width: '100%' }}
                      >
                        {availableColumns.map(col => (
                          <Select.Option key={col.value} value={col.value}>
                            {col.label}
                          </Select.Option>
                        ))}
                      </Select>
                    ) : (
                      <Input
                        value={overlay.text}
                        onChange={(e) => updateTextOverlay(overlay.id, { text: e.target.value })}
                        placeholder="Введите текст"
                        size="small"
                      />
                    )}

                    <Space>
                      <ColorPicker
                        value={overlay.color}
                        onChange={(color) => updateTextOverlay(overlay.id, { color: color.toHexString() })}
                        size="small"
                      />
                      <Select
                        value={overlay.fontFamily}
                        onChange={(value) => updateTextOverlay(overlay.id, { fontFamily: value })}
                        size="small"
                        style={{ width: 100 }}
                      >
                        <Select.Option value="Arial">Arial</Select.Option>
                        <Select.Option value="Times New Roman">Times</Select.Option>
                        <Select.Option value="Montserrat">Montserrat</Select.Option>
                      </Select>
                      <Slider
                        min={8}
                        max={120}
                        step={1}
                        value={overlay.fontSize}
                        onChange={(value) => updateTextOverlay(overlay.id, { fontSize: value })}
                        style={{ width: 80 }}
                      />
                    </Space>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Text style={{ fontSize: 12, minWidth: 60 }}>Интервал:</Text>
                      <Slider
                        min={-5}
                        max={30}
                        step={0.5}
                        value={overlay.letterSpacing || 0}
                        onChange={(value) => updateTextOverlay(overlay.id, { letterSpacing: value })}
                        style={{ flex: 1 }}
                      />
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Preview Panel */}
      <div style={{ flex: 1, background: '#f5f5f5', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, padding: 20 }}>
        <div
          style={{
            width: previewWidth,
            height: previewHeight,
            position: "relative",
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
            backgroundImage: `url(${selectedBg === "user" && userBg ? userBg : selectedBg})`,
            backgroundSize: "cover",
            backgroundRepeat: "no-repeat",
            backgroundPosition: "center",
            backgroundColor: "#fff",
          }}
          ref={containerRef}
        >
          {/* QR код */}
          {previewRow?.qr ? (
            <img
              src={previewRow.qr}
              alt="QR"
              style={{
                position: "absolute",
                left: previewLeft,
                top: previewTop,
                width: qrSidePreview,
                height: qrSidePreview,
                transform: "translate(-50%, -50%)",
                cursor: "grab",
                userSelect: "none",
              }}
              onMouseDown={handleQrDrag}
            />
          ) : (
            /* Placeholder QR if no data yet */
            <div style={{
              position: "absolute",
              left: previewLeft,
              top: previewTop,
              width: qrSidePreview,
              height: qrSidePreview,
              transform: "translate(-50%, -50%)",
              border: '2px dashed #999',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(0,0,0,0.05)',
              cursor: 'grab'
            }} onMouseDown={handleQrDrag}>
              QR
            </div>
          )}

          {/* Текстовые overlay'и */}
          {textOverlays.map((overlay) => (
            <div
              key={overlay.id}
              style={{
                position: "absolute",
                left: overlay.position.xPct * previewWidth,
                top: overlay.position.yPct * previewHeight,
                color: overlay.color,
                fontSize: overlay.fontSize,
                fontFamily: overlay.fontFamily,
                fontWeight: "bold",
                cursor: "move",
                userSelect: "none",
                textShadow: "0 2px 4px rgba(0,0,0,0.3)",
                border: selectedTextId === overlay.id ? "2px dashed #1890ff" : "1px dashed rgba(255,255,255,0)",
                background: selectedTextId === overlay.id ? "rgba(24, 144, 255, 0.1)" : "transparent",
                borderRadius: "4px",
                textAlign: "center",
                whiteSpace: 'nowrap',
                transform: "translate(-50%, -50%)",
                letterSpacing: overlay.letterSpacing ? `${overlay.letterSpacing}px` : 'normal',
                lineHeight: 1,
              }}
              onMouseDown={(e) => handleTextDrag(overlay.id, e)}
              onClick={(e) => {
                e.stopPropagation();
                setSelectedTextId(overlay.id);
              }}
            >
              {getDisplayText(overlay, previewRow)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Content>
        <div className="workspace-container">
          {/* Header / Title Area if needed */}
          <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <Title level={3} style={{ margin: 0 }}>Генератор QR-кодов</Title>
              <Text type="secondary">Загрузите Excel, настройте дизайн и скачайте готовые QR-коды</Text>
            </div>
          </div>

          {/* Naming Settings */}
          {data.length > 0 && (
            <div style={{
              marginBottom: 24,
              padding: '16px 20px',
              background: '#f8fafc',
              borderRadius: 12,
              border: '1px solid #e2e8f0',
              boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
            }}>
              <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Text strong style={{ fontSize: 14, color: '#1e293b' }}>Шаблон имени файла:</Text>
                <Tooltip title="Используйте {название_колонки} для динамического имени. Например: {name}_{number}">
                  <Text type="secondary" style={{ cursor: 'help', fontSize: 12 }}>(инфо)</Text>
                </Tooltip>
              </div>
              <Space direction="vertical" style={{ width: '100%' }} size="middle">
                <Input
                  size="large"
                  placeholder="Например: {name}_{number}"
                  value={customNamePattern}
                  onChange={e => setCustomNamePattern(e.target.value)}
                  style={{ borderRadius: 8 }}
                  prefix={<Text type="secondary" style={{ marginRight: 4 }}>Шаблон:</Text>}
                />
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>Доступные поля:</Text>
                  {/* Hardcoded system fields */}
                  {['_link', 'name', 'number'].map(field => (
                    <Tag
                      key={field}
                      color="blue"
                      style={{ cursor: 'pointer', borderRadius: 4, padding: '2px 8px' }}
                      onClick={() => setCustomNamePattern(prev => prev + `{${field}}`)}
                    >
                      {`{${field === '_link' ? 'ID' : field}}`}
                    </Tag>
                  ))}
                  {/* Dynamic Excel columns */}
                  {availableColumns.map(col => (
                    <Tag
                      key={col.value}
                      color="green"
                      style={{ cursor: 'pointer', borderRadius: 4, padding: '2px 8px' }}
                      onClick={() => setCustomNamePattern(prev => prev + `{${col.label}}`)}
                    >
                      {`{${col.label}}`}
                    </Tag>
                  ))}
                </div>
              </Space>
            </div>
          )}

          {/* Toolbar */}
          <div className="toolbar">
            <div className="toolbar-actions">
              <Upload beforeUpload={handleFileUpload} showUploadList={false}>
                <Button type="primary" icon={<FileExcelOutlined />} size="large">
                  Загрузить Excel
                </Button>
              </Upload>

              <Tooltip title={!data.length ? "Сначала загрузите таблицу" : "Настроить и скачать всё"}>
                <Button
                  onClick={() => setAllModalVisible(true)}
                  disabled={!data.length}
                  icon={<DownloadOutlined />}
                  size="large"
                >
                  Сгенерировать все
                </Button>
              </Tooltip>
            </div>

            <div className="toolbar-search">
              <div className="status-badge">
                <Badge status={data.length ? "processing" : "default"} />
                <span>Всего: {data.length}</span>
              </div>
              <div className="status-badge">
                <Badge status="success" />
                <span>Готово: {data.filter(r => r.qr).length}</span>
              </div>
              <Input
                placeholder="Поиск по имени, ID, номеру..."
                allowClear
                prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                style={{ width: 280 }}
              />
            </div>
          </div>

          <Form form={form} component={false}>
            <Table
              columns={tableColumns}
              dataSource={filteredData}
              pagination={{ pageSize: 10 }}
              size="middle"
              scroll={{ x: 'max-content' }}
              locale={{ emptyText: 'Загрузите Excel файл, чтобы начать работу' }}
            />
          </Form>

          {/* Single Modal Editor */}
          <Modal
            title="Настройка и скачивание"
            open={downloadModalVisible}
            onCancel={() => {
              setDownloadModalVisible(false);
              setTextOverlays([]);
            }}
            onOk={handleDownloadOne}
            okText="Скачать PNG"
            cancelText="Отмена"
            width={900}
            centered
          >
            {renderEditorContent(selectedRow)}
            <div style={{ textAlign: 'center', marginTop: 10 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                💡 Перетаскивайте QR-код и текст мышкой прямо на изображении
              </Text>
            </div>
          </Modal>

          {/* All Modal - Full Editor for Batch */}
          <Modal
            title="Пакетная генерация"
            open={allModalVisible}
            onCancel={() => setAllModalVisible(false)}
            footer={[
              <Button key="generate" type="primary" size="large" onClick={generateAllQrs} loading={isGeneratingAll} icon={<QrcodeOutlined />}>
                {isGeneratingAll ? "Генерация..." : "Начать генерацию"}
              </Button>,
              <Button key="download" size="large" onClick={downloadAllZip} disabled={isGeneratingAll || !Object.keys(generatedQrs).length} icon={<DownloadOutlined />}>
                Скачать ZIP
              </Button>,
            ]}
            width={900}
            centered
          >
            <div>
              <div style={{ background: '#fffbe6', padding: 12, borderRadius: 6, border: '1px solid #ffe58f', marginBottom: 16 }}>
                <Text type="warning">
                  Настройте шаблон ниже. Эти настройки (фон, положение, размер, текст) будут применены ко <b>всем {data.length} строкам</b>.
                </Text>
              </div>

              {renderEditorContent(data.length ? data[0] : null)}

              {progress > 0 && (
                <div style={{ marginTop: 24 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <Text>Прогресс генерации</Text>
                    <Text>{progress}%</Text>
                  </div>
                  <Progress percent={progress} showInfo={false} />
                </div>
              )}
            </div>
          </Modal>
        </div>
      </Content>
    </Layout>
  );
};

export default App;

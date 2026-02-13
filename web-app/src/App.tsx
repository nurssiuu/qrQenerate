
import React, { useState, useRef, useMemo } from "react";
import {
  Button,
  Table,
  Upload,
  message,
  Space,
  Input,
  Form,
  Radio,
  Modal,
  Slider,
  Progress,
  Select,
  ColorPicker,
} from "antd";
import { UploadOutlined, DownloadOutlined, PlusOutlined, DeleteOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import * as XLSX from "xlsx";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import QRCodeStyling from "qr-code-styling";

import Mlogo from "./assets/logo.png";
import Bg1 from "./assets/bg.png"; // Fixed
import Bg2 from "./assets/bg.png"; // Fixed (placeholder)
import Bg3 from "./assets/bg.png"; // Fixed (placeholder)

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
  columnSource?: string; // Колонка-источник данных
  isDynamic: boolean; // Динамический текст из данных или статический
}

// ---------- Константы ----------
const modalSize = 490;
const canvasSize = 5000;
const margin = 200;
const scaleRatio = canvasSize / modalSize; // ≈ 10.2

// ---------- Вспомогательные функции ----------
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

const mergeQrWithBackground = async (
  qrBlob: Blob,
  bgSrc: string,
  posPct: PositionPct,
  qrSizePct: number,
  textOverlays: TextOverlay[] = [],
  rowData?: RowData, // Добавляем данные строки для динамического текста
  canvasSizeParam = canvasSize,
  marginParam = margin
) => {
  const canvas = document.createElement("canvas");
  canvas.width = canvasSizeParam;
  canvas.height = canvasSizeParam;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");

  const bgImg = new Image();
  const qrImg = new Image();
  bgImg.crossOrigin = "anonymous";
  qrImg.crossOrigin = "anonymous";

  return new Promise<Blob>((resolve, reject) => {
    bgImg.onload = () => {
      // === Вписываем фон целиком (object-fit: contain) ===
      const bgAspect = bgImg.width / bgImg.height;
      const canvasAspect = canvas.width / canvas.height;

      let drawWidth, drawHeight, drawX, drawY;

      if (bgAspect > canvasAspect) {
        drawWidth = canvas.width;
        drawHeight = canvas.width / bgAspect;
        drawX = 0;
        drawY = (canvas.height - drawHeight) / 2;
      } else {
        drawHeight = canvas.height;
        drawWidth = canvas.height * bgAspect;
        drawY = 0;
        drawX = (canvas.width - drawWidth) / 2;
      }

      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.drawImage(bgImg, drawX, drawY, drawWidth, drawHeight);

      // === Рисуем QR ===
      qrImg.onload = () => {
        const maxQrSize = canvasSizeParam - marginParam * 2;
        const targetSize = Math.min(maxQrSize, Math.round(canvasSizeParam * qrSizePct));
        const centerX = Math.round(posPct.xPct * canvasSizeParam);
        const centerY = Math.round(posPct.yPct * canvasSizeParam);

        const drawX = Math.max(
          marginParam,
          Math.min(centerX - targetSize / 2, canvasSizeParam - targetSize - marginParam)
        );
        const drawY = Math.max(
          marginParam,
          Math.min(centerY - targetSize / 2, canvasSizeParam - targetSize - marginParam)
        );

        ctx.drawImage(qrImg, drawX, drawY, targetSize, targetSize);

        // === Рисуем текстовые overlay'и ===
        textOverlays.forEach(overlay => {
          // Определяем текст: статический или из данных
          let displayText = overlay.text;
          if (overlay.isDynamic && overlay.columnSource && rowData) {
            displayText = rowData[overlay.columnSource] || overlay.text;
          }

          // Масштабируем размер шрифта для canvas 5000px
          const scaledFontSize = overlay.fontSize * scaleRatio;

          ctx.fillStyle = overlay.color;
          ctx.font = `bold ${scaledFontSize}px ${overlay.fontFamily}`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";

          const textX = Math.round(overlay.position.xPct * canvasSizeParam);
          const textY = Math.round(overlay.position.yPct * canvasSizeParam);

          // Добавляем тень для лучшей читаемости
          ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
          ctx.shadowBlur = 15;
          ctx.shadowOffsetX = 5;
          ctx.shadowOffsetY = 5;

          ctx.fillText(displayText, textX, textY);

          // Сбрасываем тень
          ctx.shadowColor = 'transparent';
          ctx.shadowBlur = 0;
          ctx.shadowOffsetX = 0;
          ctx.shadowOffsetY = 0;
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

// ---------- Компонент ----------
const App: React.FC = () => {
  const [data, setData] = useState<RowData[]>([]);
  const [columns, setColumns] = useState<any[]>([]);
  const [form] = Form.useForm();
  const [selectedRow, setSelectedRow] = useState<RowData | null>(null);
  const [downloadModalVisible, setDownloadModalVisible] = useState(false);
  const [allModalVisible, setAllModalVisible] = useState(false);
  const [qrPosPct, setQrPosPct] = useState<PositionPct>({ xPct: 0.2, yPct: 0.2 });
  const [qrSizePct, setQrSizePct] = useState<number>(0.24);
  const [selectedBg, setSelectedBg] = useState<string>(Bg1);
  const [userBg, setUserBg] = useState<string | null>(null);
  const [isGeneratingAll, setIsGeneratingAll] = useState(false);
  const [generatedQrs, setGeneratedQrs] = useState<Record<string, Blob>>({});
  const [progress, setProgress] = useState<number>(0);
  const [searchText, setSearchText] = useState("");
  const [saveColumns] = useState<string[]>([]); // eslint-disable-line @typescript-eslint/no-unused-vars
  const [customNamePattern] = useState<string>(""); // eslint-disable-line @typescript-eslint/no-unused-vars

  // ---------- Text Overlay State ----------
  const [textOverlays, setTextOverlays] = useState<TextOverlay[]>([]);
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);

  const bgTemplates = [
    { label: "Фон 1", value: Bg1 },
    { label: "Фон 2", value: Bg2 },
    { label: "Фон 3", value: Bg3 },
    { label: "Свой фон", value: "user" },
  ];

  // Получаем доступные колонки для выбора
  const availableColumns = useMemo(() => {
    return columns
      .filter(col => col.dataIndex && col.dataIndex !== 'qr')
      .map(col => ({
        label: col.title || col.dataIndex,
        value: col.dataIndex
      }));
  }, [columns]);

  const getFileName = (row: RowData) => {
    if (customNamePattern.trim()) {
      let result = customNamePattern;
      Object.keys(row).forEach((key) => {
        if (typeof row[key] === "string") {
          result = result.replaceAll(`{${key}}`, row[key]);
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

  // ---------- Text Overlay Functions ----------
  const addTextOverlay = () => {
    const newOverlay: TextOverlay = {
      id: Date.now().toString(),
      text: "Ваш текст",
      color: "#ffffff",
      fontSize: 24,
      fontFamily: "Arial",
      position: { xPct: 0.5, yPct: 0.1 },
      isDynamic: false // По умолчанию статический текст
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

    const startLeft = overlay.position.xPct * modalSize;
    const startTop = overlay.position.yPct * modalSize;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;
      let newX = (startLeft + dx) / modalSize;
      let newY = (startTop + dy) / modalSize;

      // Ограничиваем перемещение в пределах контейнера
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
    const startLeft = previewLeft;
    const startTop = previewTop;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;
      const newLeft = Math.min(Math.max(0, startLeft + dx), modalSize - modalSize * qrSizePct);
      const newTop = Math.min(Math.max(0, startTop + dy), modalSize - modalSize * qrSizePct);
      setQrPosPct({
        xPct: (newLeft + (modalSize * qrSizePct) / 2) / modalSize,
        yPct: (newTop + (modalSize * qrSizePct) / 2) / modalSize,
      });
    };

    const onMouseUp = () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  };

  // Получаем отображаемый текст для превью
  const getDisplayText = (overlay: TextOverlay, row?: RowData | null) => {
    if (overlay.isDynamic && overlay.columnSource && row) {
      return row[overlay.columnSource] || `{${overlay.columnSource}}`;
    }
    return overlay.text;
  };

  // File upload function
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

        cols.push({
          title: "QR",
          key: "qr",
          render: (_: any, record: RowData) => (
            <Space direction="vertical" align="center">
              {record.qr ? (
                <>
                  <img src={record.qr} alt="qr" style={{ width: 140, height: 140 }} />
                  <Button
                    size="small"
                    icon={<DownloadOutlined />}
                    onClick={() => openSingleModal(record)}
                  >
                    Скачать
                  </Button>
                </>
              ) : (
                <Button
                  size="small"
                  onClick={async () => {
                    try {
                      const qrBlob = await generateQrPng(record._link);
                      const qrUrl = URL.createObjectURL(qrBlob);
                      setData((prev) => prev.map((r) => (r.key === record.key ? { ...r, qrBlob, qr: qrUrl } : r)));
                      message.success("QR сгенерирован");
                    } catch {
                      message.error("Ошибка при генерации QR");
                    }
                  }}
                >
                  Сгенерировать
                </Button>
              )}
            </Space>
          ),
        });

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
        .filter((k) => !["qr", "qrBlob", "mergedBlob"].includes(k))
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

  const previewLeft = Math.max(
    0,
    Math.min(modalSize - modalSize * qrSizePct, Math.round(qrPosPct.xPct * modalSize - (modalSize * qrSizePct) / 2))
  );
  const previewTop = Math.max(
    0,
    Math.min(modalSize - modalSize * qrSizePct, Math.round(qrPosPct.yPct * modalSize - (modalSize * qrSizePct) / 2))
  );

  const handleDownloadOne = async () => {
    if (!selectedRow || !selectedRow.qrBlob) return;
    try {
      const bg = selectedBg === "user" && userBg ? userBg : selectedBg;
      const mergedBlob = await mergeQrWithBackground(selectedRow.qrBlob, bg!, qrPosPct, qrSizePct, textOverlays, selectedRow);
      saveAs(mergedBlob, `${getFileName(selectedRow)}.png`);
      setData((prev) => prev.map((r) => (r.key === selectedRow.key ? { ...r, mergedBlob } : r)));
      setDownloadModalVisible(false);
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
            console.warn(`Ошибка при генерации QR для строки ${row.key}`);
            continue;
          }
        }

        try {
          const bg = selectedBg === "user" && userBg ? userBg : selectedBg;
          const mergedBlob = await mergeQrWithBackground(row.qrBlob, bg!, qrPosPct, qrSizePct, textOverlays, row);
          newGenerated[row.key] = mergedBlob;
          row.mergedBlob = mergedBlob;
        } catch (err) {
          console.warn(`Ошибка при объединении QR и фона для строки ${row.key}:`, err);
        }

        setProgress(Math.round(((i + 1) / data.length) * 100));
      }

      setGeneratedQrs(newGenerated); // eslint-disable-line @typescript-eslint/no-unused-vars
      setData([...data]);
      message.success(`Сгенерировано ${Object.keys(newGenerated).length} изображений`);
    } finally {
      setIsGeneratingAll(false);
    }
  };

  const downloadAllZip = async () => {
    if (!Object.keys(generatedQrs).length) {
      return message.info("Сначала нажмите 'Сгенерировать все'");
    }
    try {
      const zip = new JSZip();
      data.forEach((row) => {
        const blob = generatedQrs[row.key] || row.mergedBlob;
        if (!blob) return;
        const name = `${getFileName(row)}.png`;
        zip.file(name, blob);
      });
      const content = await zip.generateAsync({ type: "blob" });
      saveAs(content, "All_QR.zip");
      message.success("ZIP скачан");
    } catch {
      message.error("Ошибка при создании архива");
    }
  };

  const mergedColumns = columns.map((col: any) => {
    if (!col.editable) return col;
    return {
      ...col,
      onCell: (record: RowData) => ({ record, dataIndex: col.dataIndex }),
    };
  });

  // ---------- UI ----------
  return (
    <Form form={form} component={false}>
      <div style={{ padding: 20 }}>
        <Space style={{ marginBottom: 12 }}>
          <Upload beforeUpload={handleFileUpload} showUploadList={false}>
            <Button icon={<UploadOutlined />}>Загрузить Excel</Button>
          </Upload>
          <Button
            type="primary"
            onClick={() => setAllModalVisible(true)}
            disabled={!data.length}
            icon={<DownloadOutlined />}
          >
            Сгенерировать / Скачать все
          </Button>
          <Input.Search
            placeholder="Поиск..."
            allowClear
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 240 }}
          />
        </Space>

        <Table
          columns={mergedColumns as ColumnsType<RowData>}
          dataSource={filteredData}
          pagination={{ pageSize: 10 }}
          bordered
        />

        {/* Single Modal с текстовыми overlay'ями */}
        <Modal
          title="Переместите и настройте QR"
          open={downloadModalVisible}
          onCancel={() => {
            setDownloadModalVisible(false);
            setTextOverlays([]);
          }}
          onOk={handleDownloadOne}
          okText="Скачать"
          width={800}
        >
          <div style={{ display: "flex", gap: 20 }}>
            {/* Левая панель - настройки */}
            <div style={{ flex: 1 }}>
              <p><strong>Фон:</strong></p>
              <Radio.Group
                value={selectedBg}
                onChange={(e) => setSelectedBg(e.target.value)}
                style={{ display: "flex", flexDirection: "column", gap: 8 }}
              >
                {bgTemplates.map((bg) => (
                  <Radio key={bg.value} value={bg.value}>
                    {bg.label}
                  </Radio>
                ))}
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
                  <Button style={{ marginTop: 8 }}>Загрузить свой фон</Button>
                </Upload>
              )}

              <p style={{ marginTop: 12 }}><strong>Размер QR:</strong> {(qrSizePct * 100).toFixed(0)}%</p>
              <Slider min={0.05} max={0.8} step={0.01} value={qrSizePct} onChange={setQrSizePct} />

              {/* Управление текстовыми overlay'ями */}
              <div style={{ marginTop: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <p style={{ margin: 0, fontWeight: 'bold' }}>Текстовые overlay'и:</p>
                  <Button
                    type="primary"
                    size="small"
                    icon={<PlusOutlined />}
                    onClick={addTextOverlay}
                  >
                    Добавить текст
                  </Button>
                </div>

                {textOverlays.length === 0 ? (
                  <p style={{ color: '#999', fontStyle: 'italic' }}>Нет добавленных текстов</p>
                ) : (
                  textOverlays.map((overlay) => (
                    <div
                      key={overlay.id}
                      style={{
                        padding: 8,
                        marginBottom: 8,
                        border: selectedTextId === overlay.id ? '2px solid #1890ff' : '1px solid #d9d9d9',
                        borderRadius: 4,
                        cursor: 'pointer',
                        backgroundColor: selectedTextId === overlay.id ? '#f0f8ff' : '#fff'
                      }}
                      onClick={() => setSelectedTextId(overlay.id)}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <span style={{ fontWeight: 'bold' }}>
                            {getDisplayText(overlay, selectedRow)}
                          </span>
                          {overlay.isDynamic && (
                            <span style={{ fontSize: 10, color: '#52c41a', marginLeft: 8 }}>
                              [из {overlay.columnSource}]
                            </span>
                          )}
                        </div>
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
                        <div style={{ marginTop: 8 }}>
                          {/* Переключатель типа текста */}
                          <div style={{ marginBottom: 8 }}>
                            <Radio.Group
                              value={overlay.isDynamic ? 'dynamic' : 'static'}
                              onChange={(e) => {
                                const isDynamic = e.target.value === 'dynamic';
                                updateTextOverlay(overlay.id, {
                                  isDynamic,
                                  text: isDynamic ? '' : 'Ваш текст'
                                });
                              }}
                            >
                              <Radio value="static">Статический текст</Radio>
                              <Radio value="dynamic" disabled={availableColumns.length === 0}>
                                Из данных {availableColumns.length === 0 && '(нет колонок)'}
                              </Radio>
                            </Radio.Group>
                          </div>

                          {overlay.isDynamic ? (
                            // Выбор колонки для динамического текста
                            <Select
                              value={overlay.columnSource}
                              onChange={(value) => updateTextOverlay(overlay.id, { columnSource: value })}
                              placeholder="Выберите колонку"
                              style={{ width: '100%', marginBottom: 8 }}
                              size="small"
                            >
                              {availableColumns.map(col => (
                                <Select.Option key={col.value} value={col.value}>
                                  {col.label} ({col.value})
                                </Select.Option>
                              ))}
                            </Select>
                          ) : (
                            // Статический текст
                            <Input
                              value={overlay.text}
                              onChange={(e) => updateTextOverlay(overlay.id, { text: e.target.value })}
                              placeholder="Введите текст"
                              style={{ marginBottom: 8 }}
                            />
                          )}

                          <div style={{ marginBottom: 8 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                              <span style={{ fontSize: 12 }}>Размер текста: {overlay.fontSize}px</span>
                              <span style={{ fontSize: 10, color: '#999' }}>
                                (на изображении: {Math.round(overlay.fontSize * scaleRatio)}px)
                              </span>
                            </div>
                            <Slider
                              min={8}
                              max={72}
                              step={1}
                              value={overlay.fontSize}
                              onChange={(value) => updateTextOverlay(overlay.id, { fontSize: value })}
                            />
                          </div>

                          <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                            <span style={{ fontSize: 12 }}>Цвет:</span>
                            <ColorPicker
                              value={overlay.color}
                              onChange={(color) => updateTextOverlay(overlay.id, { color: color.toHexString() })}
                              size="small"
                            />
                          </div>

                          <Select
                            value={overlay.fontFamily}
                            onChange={(value) => updateTextOverlay(overlay.id, { fontFamily: value })}
                            style={{ width: '100%' }}
                            size="small"
                          >
                            <Select.Option value="Arial">Arial</Select.Option>
                            <Select.Option value="Times New Roman">Times New Roman</Select.Option>
                            <Select.Option value="Georgia">Georgia</Select.Option>
                            <Select.Option value="Verdana">Verdana</Select.Option>
                            <Select.Option value="Tahoma">Tahoma</Select.Option>
                            <Select.Option value="Impact">Impact</Select.Option>
                          </Select>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Правая панель - превью */}
            <div style={{ flex: 1 }}>
              <div
                style={{
                  width: modalSize,
                  height: modalSize,
                  position: "relative",
                  border: "1px solid #ccc",
                  backgroundImage: `url(${selectedBg === "user" && userBg ? userBg : selectedBg})`,
                  backgroundSize: "contain",
                  backgroundRepeat: "no-repeat",
                  backgroundPosition: "center",
                  backgroundColor: "#fff",
                }}
                ref={containerRef}
              >
                {/* QR код */}
                {selectedRow?.qr && (
                  <img
                    src={selectedRow.qr}
                    alt="QR"
                    style={{
                      position: "absolute",
                      left: previewLeft,
                      top: previewTop,
                      width: modalSize * qrSizePct,
                      height: modalSize * qrSizePct,
                      cursor: "grab",
                      userSelect: "none",
                    }}
                    onMouseDown={handleQrDrag}
                  />
                )}

                {/* Текстовые overlay'и */}
                {textOverlays.map((overlay) => (
                  <div
                    key={overlay.id}
                    style={{
                      position: "absolute",
                      left: overlay.position.xPct * modalSize - 50,
                      top: overlay.position.yPct * modalSize - overlay.fontSize / 2,
                      color: overlay.color,
                      fontSize: overlay.fontSize,
                      fontFamily: overlay.fontFamily,
                      fontWeight: "bold",
                      cursor: "move",
                      userSelect: "none",
                      textShadow: "2px 2px 4px rgba(0,0,0,0.8)",
                      border: selectedTextId === overlay.id ? "2px dashed #1890ff" : "1px dashed rgba(255,255,255,0.5)",
                      padding: "4px 8px",
                      background: selectedTextId === overlay.id ? "rgba(24, 144, 255, 0.2)" : "rgba(0, 0, 0, 0.3)",
                      borderRadius: "4px",
                      minWidth: 100,
                      textAlign: "center",
                      whiteSpace: 'nowrap',
                      backdropFilter: 'blur(2px)',
                    }}
                    onMouseDown={(e) => handleTextDrag(overlay.id, e)}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedTextId(overlay.id);
                    }}
                  >
                    {getDisplayText(overlay, selectedRow)}
                  </div>
                ))}
              </div>
              <p style={{ textAlign: 'center', marginTop: 8, color: '#666', fontSize: 12 }}>
                Перетаскивайте QR и текст мышкой
              </p>
            </div>
          </div>
        </Modal>

        {/* All Modal */}
        <Modal
          title="Настройки для всех QR"
          open={allModalVisible}
          onCancel={() => setAllModalVisible(false)}
          footer={[
            <Button key="generate" type="primary" onClick={generateAllQrs} disabled={isGeneratingAll}>
              Сгенерировать все
            </Button>,
            <Button key="download" onClick={downloadAllZip} disabled={isGeneratingAll}>
              Скачать ZIP
            </Button>,
          ]}
          width={800}
        >
          <p>Фон:</p>
          <Radio.Group
            value={selectedBg}
            onChange={(e) => setSelectedBg(e.target.value)}
            style={{ display: "flex", flexDirection: "column", gap: 8 }}
          >
            {bgTemplates.map((bg) => (
              <Radio key={bg.value} value={bg.value}>
                {bg.label}
              </Radio>
            ))}
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
              <Button style={{ marginTop: 8 }}>Загрузить свой фон</Button>
            </Upload>
          )}

          <p style={{ marginTop: 12 }}>Размер QR: {(qrSizePct * 100).toFixed(0)}%</p>
          <Slider min={0.05} max={0.8} step={0.01} value={qrSizePct} onChange={setQrSizePct} />

          <div style={{ marginTop: 20 }}>
            <p><strong>Текстовые overlay'и:</strong></p>
            {textOverlays.length === 0 ? (
              <p style={{ color: '#999', fontStyle: 'italic' }}>Нет текстовых overlay'ей</p>
            ) : (
              textOverlays.map((overlay) => (
                <div key={overlay.id} style={{ padding: 4, fontSize: 12 }}>
                  {overlay.isDynamic ? (
                    <span>"{overlay.columnSource}" из данных - {overlay.fontSize}px, {overlay.color}</span>
                  ) : (
                    <span>"{overlay.text}" - {overlay.fontSize}px, {overlay.color}</span>
                  )}
                </div>
              ))
            )}
          </div>

          <Progress percent={progress} style={{ marginTop: 12 }} />
        </Modal>
      </div>
    </Form>
  );
};

export default App; // Changed from ExcelUI to App

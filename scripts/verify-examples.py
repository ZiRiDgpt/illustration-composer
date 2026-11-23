"""Validate actual Figma SVG exports using Python's standard library."""
import hashlib
import json
from pathlib import Path
import re
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
PALETTES = {
    "Сирень": {"#D7CDF5", "#AA9BF0", "#7864D7", "#181817", "#F9ECB0", "#F9A3AA", "#FFE3E1", "#FFFFFF"},
    "Персик": {"#FDD7B9", "#FAC896", "#D27532", "#181817", "#F9ECB0", "#80DADA", "#BEEBEB", "#FFFFFF"},
    "Мята": {"#BEEBEB", "#80DADA", "#5ABEBE", "#181817", "#FFD4F2", "#6D7BFC", "#B6C6FE", "#FFFFFF"},
}
report = []
for recipe in json.loads((ROOT / "examples/recipes.json").read_text(encoding="utf-8")):
    path = ROOT / "examples" / recipe["file"]
    data = path.read_bytes()
    text = data.decode("utf-8")
    svg = ET.fromstring(text)
    tags = [node.tag.rsplit("}", 1)[-1] for node in svg.iter()]
    assert svg.tag == "{http://www.w3.org/2000/svg}svg", path
    assert (float(svg.attrib["width"]), float(svg.attrib["height"])) == (recipe["width"], recipe["height"]), path
    assert svg.attrib["viewBox"] == f'0 0 {recipe["width"]} {recipe["height"]}', path
    assert not ({"image", "foreignObject", "script", "text"} & set(tags)), path
    assert "data:image/" not in text, path
    colors = set()
    for node in svg.iter():
        for attribute in ("fill", "stroke", "stop-color"):
            value = node.attrib.get(attribute, "")
            if re.fullmatch(r"#[0-9a-fA-F]{3}", value):
                colors.add("#" + "".join(c * 2 for c in value[1:]).upper())
            elif re.fullmatch(r"#[0-9a-fA-F]{6}", value):
                colors.add(value.upper())
    assert colors <= PALETTES[recipe["palette"]], (path, colors - PALETTES[recipe["palette"]])
    ids = [node.attrib["id"] for node in svg.iter() if "id" in node.attrib]
    assert any("главный" in name for name in ids), path
    assert any("фоновый" in name for name in ids) == recipe["background"], path
    assert tags.count("path") > 20, path
    report.append({"file": recipe["file"], "width": recipe["width"], "height": recipe["height"],
                   "bytes": len(data), "paths": tags.count("path"), "groups": tags.count("g"),
                   "images": tags.count("image"), "colors": sorted(colors),
                   "xml_valid": True, "sha256": hashlib.sha256(data).hexdigest()})
out = ROOT / "docs/example-verification.json"
out.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps(report, ensure_ascii=False, indent=2))

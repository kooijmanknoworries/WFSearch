#!/usr/bin/env python3
"""Extract Dutch female names from studiopoppy.nl HTML."""
import re, json

with open('/tmp/studiopoppy.html', encoding='utf-8') as f:
    html = f.read()

letter_pattern = r'<strong>&nbsp;([A-Z])</strong>'
letter_matches = list(re.finditer(letter_pattern, html))

names = {}
for i, match in enumerate(letter_matches):
    letter = match.group(1)
    start = match.end()
    end = letter_matches[i + 1].start() if i + 1 < len(letter_matches) else len(html)
    section = html[start:end]
    
    name_matches = re.findall(r'<td[^>]*>([^<]+)</td>', section)
    cleaned = [n.strip() for n in name_matches if n.strip() and len(n.strip()) >= 2]
    
    seen = set()
    unique = []
    for n in cleaned:
        if n not in seen:
            seen.add(n)
            unique.append(n)
    names[letter] = unique

parts = []
for letter in sorted(names.keys()):
    parts.append(f'"{letter}":{json.dumps(names[letter])}')

result = '{' + ','.join(parts) + '}'
print(result)

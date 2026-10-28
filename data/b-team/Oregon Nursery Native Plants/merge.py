import csv, json, sys, os
api, d = sys.argv[1], sys.argv[2]
cls = json.load(open(api))["checklists"]
rows = 0
with open(os.path.join(d, "All Nurseries.csv"), "w", newline="", encoding="utf-8") as out, \
     open(os.path.join(d, "provenance.txt"), "w", encoding="utf-8") as prov:
    prov.write("Oregon nursery native plant lists, downloaded 2026-10-28 from OregonFlora\n")
    prov.write("Project page: https://oregonflora.org/projects/index.php?pid=4\n\n")
    w = csv.writer(out)
    header = None
    for c in sorted(cls, key=lambda c: c["name"]):
        fn = c["name"] + ".csv"
        url = "https://oregonflora.org/ident/rpc/api.php?export=csv&clid=%s&pid=4&dynclid=-1" % c["clid"]
        prov.write("%s\n    %s\n" % (fn, url))
        with open(os.path.join(d, fn), newline="", encoding="utf-8") as f:
            r = csv.reader(f)
            h = next(r)
            if header is None:
                header = h
                w.writerow(["Nursery"] + h)
            assert h == header, fn
            for row in r:
                if row:
                    w.writerow([c["name"]] + row)
                    rows += 1
    prov.write("\nAll Nurseries.csv\n    Merge of the above files with a leading Nursery column\n")
print(rows)

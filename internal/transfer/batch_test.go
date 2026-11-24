package transfer

import (
	"encoding/base64"
	"testing"
)

func TestValidationRequiresUniqueKeysAndPreviewRevisions(t *testing.T) {
	key := base64.StdEncoding.EncodeToString([]byte{0, 255, 1})
	batch := Batch{Version: 1, Operation: "import", Policy: "create", DryRun: true, Records: []Record{{KeyBase64: key, ValueBase64: ""}}}
	if err := Validate(batch); err != nil {
		t.Fatal(err)
	}
	batch.DryRun = false
	if Validate(batch) == nil {
		t.Fatal("accepted absent preview revision")
	}
	batch.Records[0].ExpectedRevision = "1"
	if Validate(batch) == nil {
		t.Fatal("create-only overwrites accepted")
	}
	batch.Policy = "overwrite"
	if err := Validate(batch); err != nil {
		t.Fatal(err)
	}
	batch.Records = append(batch.Records, batch.Records[0])
	if Validate(batch) == nil {
		t.Fatal("duplicate keys accepted")
	}
}

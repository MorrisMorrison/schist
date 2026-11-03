package serializer

import (
	"encoding/json"
	"strings"
	"testing"
	"time"

	"github.com/MorrisMorrison/schist/internal/models"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const customFrontMatter = `---
title: Router
path: /devices/router
created: 2025-03-04T10:00:00Z
updated: 2025-03-05T10:00:00Z
tags: [network]
status: active
aliases: [gateway, gw]
port: 8080
weight: 1.5
enabled: true
since: 2025-03-04
owner: null
host: "[[server]]"
nested:
  vlan: 10
  ports: [1, 2]
---

Body.`

func TestDeserializeDocument_KeepsCustomFrontMatter(t *testing.T) {
	doc, err := DeserializeDocument([]byte(customFrontMatter))
	require.NoError(t, err)

	assert.Equal(t, "Router", doc.MetaData.Title)
	assert.Equal(t, []string{"network"}, doc.MetaData.Tags)
	assert.Equal(t, map[string]any{
		"status":  "active",
		"aliases": []any{"gateway", "gw"},
		"port":    8080,
		"weight":  1.5,
		"enabled": true,
		"since":   "2025-03-04",
		"owner":   nil,
		"host":    "[[server]]",
		"nested":  map[string]any{"vlan": 10, "ports": []any{1, 2}},
	}, doc.MetaData.Properties, "only keys Schist doesn't know are properties")
	assert.Equal(t, "Body.", doc.Content)
}

func TestDeserializeDocument_NoCustomFrontMatter(t *testing.T) {
	doc, err := DeserializeDocument([]byte("---\ntitle: Plain\npath: /plain\n---\n\nx"))
	require.NoError(t, err)
	assert.Nil(t, doc.MetaData.Properties)
}

func TestSerializeDocument_PropertiesRoundTrip(t *testing.T) {
	doc, err := DeserializeDocument([]byte(customFrontMatter))
	require.NoError(t, err)
	want := doc.MetaData.Properties

	current := doc
	for i := 0; i < 3; i++ {
		data, err := SerializeDocument(current)
		require.NoError(t, err)
		current, err = DeserializeDocument(data)
		require.NoError(t, err)
	}
	assert.Equal(t, want, current.MetaData.Properties, "properties survive save/load cycles unchanged")
	assert.Equal(t, "Router", current.MetaData.Title)
	assert.Equal(t, "Body.", current.Content)
}

func TestSerializeDocument_PropertiesNeverOverrideKnownFields(t *testing.T) {
	data, err := SerializeDocument(&models.Document{
		MetaData: &models.DocumentMetaData{
			Title: "Real", Path: "/real", Created: time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC),
			Properties: map[string]any{"title": "Fake", "path": "/elsewhere", "Tags": "x", "status": "draft"},
		},
		Content: "x",
	})
	require.NoError(t, err)
	assert.Equal(t, 1, strings.Count(string(data), "title:"), "%s", data)

	doc, err := DeserializeDocument(data)
	require.NoError(t, err)
	assert.Equal(t, "Real", doc.MetaData.Title)
	assert.Equal(t, "/real", doc.MetaData.Path)
	assert.Equal(t, map[string]any{"status": "draft"}, doc.MetaData.Properties)
}

func TestSerializeDocument_PropertiesFromJSON(t *testing.T) {
	// The API decodes properties from JSON: numbers are float64, objects map[string]any.
	var meta models.DocumentMetaData
	require.NoError(t, json.Unmarshal([]byte(
		`{"title":"T","path":"/t","properties":{"count":3,"ratio":0.5,"tags_extra":["a"],"obj":{"k":"v"}}}`), &meta))

	data, err := SerializeDocument(&models.Document{MetaData: &meta, Content: "x"})
	require.NoError(t, err)
	doc, err := DeserializeDocument(data)
	require.NoError(t, err)
	assert.Equal(t, map[string]any{
		"count": 3, "ratio": 0.5, "tags_extra": []any{"a"}, "obj": map[string]any{"k": "v"},
	}, doc.MetaData.Properties)

	out, err := json.Marshal(doc.MetaData)
	require.NoError(t, err, "nested YAML maps must be JSON-safe")
	assert.Contains(t, string(out), `"properties":{"count":3,"obj":{"k":"v"},"ratio":0.5,"tags_extra":["a"]}`)
}

package crypto

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestDeriveKey(t *testing.T) {
	a, err := DeriveKey("a long server secret", "schist github token")
	require.NoError(t, err)
	assert.Len(t, a, keyLength)

	again, err := DeriveKey("a long server secret", "schist github token")
	require.NoError(t, err)
	assert.Equal(t, a, again, "the same secret and purpose give the same key")

	otherPurpose, err := DeriveKey("a long server secret", "something else")
	require.NoError(t, err)
	assert.NotEqual(t, a, otherPurpose, "each purpose gets its own key")

	otherSecret, err := DeriveKey("another server secret", "schist github token")
	require.NoError(t, err)
	assert.NotEqual(t, a, otherSecret)

	_, err = DeriveKey("", "schist github token")
	assert.Error(t, err, "an empty secret is never a key")
}

func TestDeriveKey_WorksWithSecureStore(t *testing.T) {
	key, err := DeriveKey("a long server secret", "schist github token")
	require.NoError(t, err)
	store, err := NewSecureStoreWithKey(key, nil)
	require.NoError(t, err)

	enc, err := store.Encrypt("ghp_example")
	require.NoError(t, err)
	got, err := store.Decrypt(enc)
	require.NoError(t, err)
	assert.Equal(t, "ghp_example", got)
}
